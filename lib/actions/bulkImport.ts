"use server";

import { z } from "zod";
import { requireStoreContext } from "./shared";
import { getStoreEffectiveFeatures } from "@/lib/profiles/featureResolver";
import { productFormSchema } from "@/lib/products/schema";
import { productCsvRowSchema, splitTags } from "@/lib/products/csvSchema";
import { categoryCsvRowSchema } from "@/lib/categories/csvSchema";
import { slugify, nextAvailableSlug } from "@/lib/utils/slug";
import { createProduct, generateProductSku, type ProductInput } from "./products";
import { createCategory, type CategoryInput } from "./categories";
import type { RowValidationResult, DryRunSummary, CommitRowResult, CommitSummary } from "@/lib/csv/types";

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/**
 * A product row whose category_name doesn't match any existing category is
 * not rejected — most first-time imports don't have categories set up yet,
 * and making that a separate mandatory step is exactly the friction this
 * feature exists to remove. Instead category_id stays null and
 * newCategoryName carries the name to create (once per distinct name) at
 * commit time, respecting the same allow_new_category gate createCategory
 * already enforces; if that's off, the product still imports, just
 * uncategorized, rather than failing the whole row over it.
 */
export type ProductImportResolved = ProductInput & { newCategoryName?: string };

export async function validateProductsCsvAction(
  rows: Record<string, string>[]
): Promise<DryRunSummary<ProductImportResolved>> {
  const { supabase, storeId, role } = await requireStoreContext();

  if (role !== "super_admin") {
    const { allow_new_product } = await getStoreEffectiveFeatures(storeId);
    if (!allow_new_product) {
      return {
        rows: [],
        validCount: 0,
        invalidCount: rows.length,
        featureBlocked: true,
        featureBlockedMessage: "Product creation is disabled on this store's profile.",
      };
    }
  }

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from("categories").select("id, name").eq("store_id", storeId),
    supabase.from("products").select("sku, barcode").eq("store_id", storeId),
  ]);

  const categoryIdByName = new Map<string, string>();
  for (const c of categories ?? []) categoryIdByName.set(c.name.trim().toLowerCase(), c.id);

  // Seeded from the DB, then added to as rows are validated, so a duplicate
  // SKU/barcode *within the same file* is caught the same way a duplicate
  // against an existing product is.
  const takenSkus = new Set<string>();
  const takenBarcodes = new Set<string>();
  for (const p of products ?? []) {
    if (p.sku) takenSkus.add(p.sku.toUpperCase());
    if (p.barcode) takenBarcodes.add(p.barcode);
  }

  const results: RowValidationResult<ProductImportResolved>[] = rows.map((raw, index) => {
    const rowNumber = index + 1;
    // Blocking errors invalidate the row; notes are informational (shown
    // alongside, never on their own turn a "valid" row "invalid").
    const errors: string[] = [];
    const notes: string[] = [];

    const parsedRaw = productCsvRowSchema.safeParse(raw);
    if (!parsedRaw.success) {
      for (const issue of parsedRaw.error.issues) errors.push(issue.message);
      return { rowNumber, raw, status: "invalid", reasons: errors };
    }
    const row = parsedRaw.data;

    let categoryId: string | null = null;
    let newCategoryName: string | undefined;
    const categoryName = row.category_name.trim();
    if (categoryName) {
      const found = categoryIdByName.get(categoryName.toLowerCase());
      if (found) {
        categoryId = found;
      } else {
        newCategoryName = categoryName;
        notes.push(`Category "${categoryName}" doesn't exist yet — it will be created.`);
      }
    }

    const sku = row.sku.trim();
    const isAutoSku = sku === "";
    if (!isAutoSku) {
      const key = sku.toUpperCase();
      if (takenSkus.has(key)) {
        errors.push(`SKU "${sku}" is already used by another product in this store or elsewhere in this file.`);
      } else {
        takenSkus.add(key);
      }
    }

    const barcode = row.barcode.trim();
    if (barcode) {
      if (takenBarcodes.has(barcode)) {
        errors.push(`Barcode "${barcode}" is already used by another product in this store or elsewhere in this file.`);
      } else {
        takenBarcodes.add(barcode);
      }
    }

    const minThreshold = row.min_threshold === "" ? null : row.min_threshold;

    let resolved: ProductImportResolved | undefined;
    if (errors.length === 0) {
      try {
        // Re-validated through the exact same schema createProduct uses, so
        // this preview can never call a row "valid" that createProduct would
        // then reject. A blank SKU gets a placeholder here purely to satisfy
        // the schema's min-length rule — the real SKU is only assigned at
        // commit time via generateProductSku(), so no sequence number is
        // burned for a row the user never actually imports.
        const candidate = productFormSchema.parse({
          name: row.name,
          sku: isAutoSku ? "(auto)" : sku,
          barcode: barcode || null,
          category_id: categoryId,
          tags: splitTags(row.tags),
          description: row.description || null,
          cost_price: row.cost_price,
          retail_price: row.retail_price,
          current_stock: row.current_stock,
          min_threshold: minThreshold,
          image_url: row.image_url || null,
          is_active: row.is_active,
        });
        resolved = { ...candidate, sku: isAutoSku ? "" : candidate.sku, newCategoryName };
      } catch (err) {
        if (err instanceof z.ZodError) {
          for (const issue of err.issues) errors.push(issue.message);
        } else {
          errors.push(err instanceof Error ? err.message : "Invalid row");
        }
      }
    }

    return {
      rowNumber,
      raw,
      status: errors.length === 0 ? "valid" : "invalid",
      reasons: [...errors, ...notes],
      resolved,
    };
  });

  return {
    rows: results,
    validCount: results.filter((r) => r.status === "valid").length,
    invalidCount: results.filter((r) => r.status === "invalid").length,
    featureBlocked: false,
  };
}

export async function commitProductsImportAction(
  rows: { rowNumber: number; input: ProductImportResolved }[]
): Promise<CommitSummary> {
  const results: CommitRowResult[] = [];
  // Cached across the whole batch so N rows sharing a new category name (e.g.
  // "Menswear") only create it once, not once per row.
  const categoryIdByNewName = new Map<string, string | null>();

  // Sequential, not parallel: keeps load on generate_next_store_sku's atomic
  // counter sane and keeps per-row error isolation simple (see plan notes on
  // why this reuses createProduct row-by-row instead of a batch insert).
  for (const { rowNumber, input } of rows) {
    try {
      let categoryId = input.category_id;
      if (input.newCategoryName) {
        const key = input.newCategoryName.toLowerCase();
        if (!categoryIdByNewName.has(key)) {
          const created = await createCategory({
            name: input.newCategoryName,
            parent_id: null,
            icon: "Package",
            default_min_threshold: 5,
            is_tax_exempt: false,
          });
          // If category creation fails (e.g. allow_new_category is off), the
          // product still imports — just uncategorized — rather than losing
          // the whole row over a category that couldn't be auto-created.
          categoryIdByNewName.set(key, created.success ? created.id : null);
        }
        categoryId = categoryIdByNewName.get(key) ?? null;
      }

      const sku = input.sku || (await generateProductSku());
      const result = await createProduct({ ...input, sku, category_id: categoryId });
      if (result.success) {
        results.push({ rowNumber, success: true, id: result.id });
      } else {
        results.push({ rowNumber, success: false, error: result.error });
      }
    } catch (err) {
      results.push({
        rowNumber,
        success: false,
        error: err instanceof Error ? err.message : "Something went wrong",
      });
    }
  }

  return { results };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/**
 * A category CSV row resolves to one of three shapes:
 * - "direct": parent_id is already known (either the row is top-level, or its
 *   parent already exists in the DB or as a top-level category name).
 * - "pending-parent": the row's parent is itself another top-level row in
 *   this same file, so its real id only exists after that row commits —
 *   commitCategoriesImportAction resolves parentRowNumber to a real id once
 *   the parent has been created.
 * - "skip": a category with this exact name already exists in this scope
 *   (same store + parent) — re-importing the same file is a no-op for this
 *   row rather than a validation error, matching how mainstream bulk-import
 *   tools treat "already exists" as idempotent, not a failure.
 */
export type CategoryImportResolved =
  | { mode: "direct"; input: CategoryInput }
  | { mode: "pending-parent"; input: Omit<CategoryInput, "parent_id">; parentRowNumber: number }
  | { mode: "skip"; existingId: string };

export async function validateCategoriesCsvAction(
  rows: Record<string, string>[]
): Promise<DryRunSummary<CategoryImportResolved>> {
  const { supabase, storeId, role } = await requireStoreContext();

  if (role !== "super_admin") {
    const { allow_new_category } = await getStoreEffectiveFeatures(storeId);
    if (!allow_new_category) {
      return {
        rows: [],
        validCount: 0,
        invalidCount: rows.length,
        featureBlocked: true,
        featureBlockedMessage: "Category creation is disabled on this store's profile.",
      };
    }
  }

  const { data: existing } = await supabase
    .from("categories")
    .select("id, name, slug, parent_id")
    .eq("store_id", storeId);

  const topLevelIdByName = new Map<string, string>();
  const takenSlugs = new Set<string>();
  // Existing-category lookup, scoped like assertNameIsFree ("top" for
  // top-level, else the parent's id) — a row matching one of these is a
  // no-op skip, not an error (re-importing the same file is idempotent).
  const existingIdByScope = new Map<string, Map<string, string>>();
  const getExistingId = (scope: string, name: string) =>
    existingIdByScope.get(scope)?.get(name.trim().toLowerCase());

  // Intra-file duplicate guard: two NEW rows in the same CSV can't share a
  // name in the same scope — that's a real mistake in the file, unlike a
  // row matching something that already exists in the DB (see above).
  const takenNamesByScope = new Map<string, Set<string>>();
  const claimName = (scope: string, name: string) => {
    const set = takenNamesByScope.get(scope) ?? new Set<string>();
    set.add(name.trim().toLowerCase());
    takenNamesByScope.set(scope, set);
  };
  const isNameTaken = (scope: string, name: string) =>
    takenNamesByScope.get(scope)?.has(name.trim().toLowerCase()) ?? false;

  for (const c of existing ?? []) {
    takenSlugs.add(c.slug);
    if (c.parent_id === null) topLevelIdByName.set(c.name.trim().toLowerCase(), c.id);
    const scope = c.parent_id ?? "top";
    const map = existingIdByScope.get(scope) ?? new Map<string, string>();
    map.set(c.name.trim().toLowerCase(), c.id);
    existingIdByScope.set(scope, map);
  }

  interface Parsed {
    rowNumber: number;
    raw: Record<string, string>;
    reasons: string[];
    row?: z.infer<typeof categoryCsvRowSchema>;
  }

  const parsed: Parsed[] = rows.map((raw, index) => {
    const rowNumber = index + 1;
    const result = categoryCsvRowSchema.safeParse(raw);
    if (!result.success) {
      return { rowNumber, raw, reasons: result.error.issues.map((i) => i.message) };
    }
    return { rowNumber, raw, reasons: [], row: result.data };
  });

  const output = new Map<number, RowValidationResult<CategoryImportResolved>>();

  // Pass 1: rows with a blank parent_name become new top-level categories.
  // A row's name colliding with ANOTHER NEW row earlier in this same file is
  // rejected (a real mistake in the file); colliding with a category that
  // already exists in the DB is a benign skip instead (re-importing the same
  // file is idempotent, not an error) — matching createCategory's own
  // assertNameIsFree scope, just with a friendlier outcome for re-imports.
  const newTopLevelRowByName = new Map<string, number>(); // name(lower) -> rowNumber, this file's pass-1 rows
  for (const p of parsed) {
    if (p.reasons.length > 0 || !p.row) continue;
    if (p.row.parent_name.trim() !== "") continue;

    const name = p.row.name.trim();
    if (isNameTaken("top", name)) {
      output.set(p.rowNumber, {
        rowNumber: p.rowNumber,
        raw: p.raw,
        status: "invalid",
        reasons: [`A category named "${name}" already exists.`],
      });
      continue;
    }
    const existingId = getExistingId("top", name);
    if (existingId) {
      claimName("top", name);
      output.set(p.rowNumber, {
        rowNumber: p.rowNumber,
        raw: p.raw,
        status: "valid",
        reasons: [`Category "${name}" already exists — this row will be skipped.`],
        resolved: { mode: "skip", existingId },
      });
      continue;
    }
    claimName("top", name);

    const slug = nextAvailableSlug(slugify(name), takenSlugs);
    takenSlugs.add(slug);
    newTopLevelRowByName.set(name.toLowerCase(), p.rowNumber);

    output.set(p.rowNumber, {
      rowNumber: p.rowNumber,
      raw: p.raw,
      status: "valid",
      reasons: [],
      resolved: {
        mode: "direct",
        input: {
          name,
          parent_id: null,
          icon: p.row.icon,
          default_min_threshold: p.row.default_min_threshold,
          is_tax_exempt: p.row.is_tax_exempt,
        },
      },
    });
  }

  // Pass 2: rows with a parent_name must resolve to either an existing
  // top-level DB category, or a pass-1 row from this same file — enforcing
  // the app's existing 2-level hierarchy (only top-level categories are
  // valid parents, per CategoryDialog.tsx).
  for (const p of parsed) {
    if (p.reasons.length > 0 || !p.row) {
      output.set(p.rowNumber, { rowNumber: p.rowNumber, raw: p.raw, status: "invalid", reasons: p.reasons });
      continue;
    }
    const parentName = p.row.parent_name.trim();
    if (parentName === "") continue; // already handled in pass 1

    const name = p.row.name.trim();
    const key = parentName.toLowerCase();
    const dbParentId = topLevelIdByName.get(key);
    const fileParentRow = newTopLevelRowByName.get(key);

    if (!dbParentId && fileParentRow === undefined) {
      output.set(p.rowNumber, {
        rowNumber: p.rowNumber,
        raw: p.raw,
        status: "invalid",
        reasons: [`Parent "${parentName}" not found — it must already exist, or be a top-level row earlier in this file.`],
      });
      continue;
    }

    // Sibling scope: the real parent id when known, otherwise a synthetic
    // per-file-row token — either way, two NEW rows for the same parent
    // can't share a name, matching assertNameIsFree. A row matching a
    // category that already exists under that parent is a benign skip
    // instead (only possible when dbParentId is known — a pending, not-yet-
    // created parent can't already have real children).
    const siblingScope = dbParentId ?? `file:${fileParentRow}`;
    if (isNameTaken(siblingScope, name)) {
      output.set(p.rowNumber, {
        rowNumber: p.rowNumber,
        raw: p.raw,
        status: "invalid",
        reasons: [`A category named "${name}" already exists under that parent.`],
      });
      continue;
    }
    const existingChildId = dbParentId ? getExistingId(dbParentId, name) : undefined;
    if (existingChildId) {
      claimName(siblingScope, name);
      output.set(p.rowNumber, {
        rowNumber: p.rowNumber,
        raw: p.raw,
        status: "valid",
        reasons: [`Category "${name}" already exists under "${parentName}" — this row will be skipped.`],
        resolved: { mode: "skip", existingId: existingChildId },
      });
      continue;
    }
    claimName(siblingScope, name);

    const slug = nextAvailableSlug(slugify(name), takenSlugs);
    takenSlugs.add(slug);

    const baseInput = {
      name,
      icon: p.row.icon,
      default_min_threshold: p.row.default_min_threshold,
      is_tax_exempt: p.row.is_tax_exempt,
    };

    output.set(p.rowNumber, {
      rowNumber: p.rowNumber,
      raw: p.raw,
      status: "valid",
      reasons: [],
      resolved: dbParentId
        ? { mode: "direct", input: { ...baseInput, parent_id: dbParentId } }
        : { mode: "pending-parent", input: baseInput, parentRowNumber: fileParentRow! },
    });
  }

  const orderedResults = rows.map((_, index) => {
    const rowNumber = index + 1;
    return output.get(rowNumber) ?? { rowNumber, raw: rows[index], status: "invalid" as const, reasons: ["Unresolved row"] };
  });

  return {
    rows: orderedResults,
    validCount: orderedResults.filter((r) => r.status === "valid").length,
    invalidCount: orderedResults.filter((r) => r.status === "invalid").length,
    featureBlocked: false,
  };
}

export async function commitCategoriesImportAction(
  rows: { rowNumber: number; resolved: CategoryImportResolved }[]
): Promise<CommitSummary> {
  const results: CommitRowResult[] = [];
  const committedIds = new Map<number, string>();

  const direct = rows.filter((r) => r.resolved.mode === "direct");
  const pending = rows.filter((r) => r.resolved.mode === "pending-parent");
  const skipped = rows.filter((r) => r.resolved.mode === "skip");

  for (const { rowNumber, resolved } of skipped) {
    if (resolved.mode !== "skip") continue;
    committedIds.set(rowNumber, resolved.existingId);
    results.push({ rowNumber, success: true, id: resolved.existingId, skipped: true });
  }

  for (const { rowNumber, resolved } of direct) {
    if (resolved.mode !== "direct") continue;
    const result = await createCategory(resolved.input);
    if (result.success) {
      committedIds.set(rowNumber, result.id);
      results.push({ rowNumber, success: true, id: result.id });
    } else {
      results.push({ rowNumber, success: false, error: result.error });
    }
  }

  for (const { rowNumber, resolved } of pending) {
    if (resolved.mode !== "pending-parent") continue;
    const parentId = committedIds.get(resolved.parentRowNumber);
    if (!parentId) {
      results.push({
        rowNumber,
        success: false,
        error: "Parent category failed to import, so this row was skipped.",
      });
      continue;
    }
    const result = await createCategory({ ...resolved.input, parent_id: parentId });
    results.push(
      result.success
        ? { rowNumber, success: true, id: result.id }
        : { rowNumber, success: false, error: result.error }
    );
  }

  return { results };
}
