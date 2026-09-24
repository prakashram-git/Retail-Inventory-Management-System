"use server";

import { revalidatePath } from "next/cache";
import { requireStoreContext } from "./shared";
import { productFormSchema, type ProductFormInput } from "@/lib/products/schema";
import { variantProductSchema, type VariantProductInput } from "@/lib/products/variants";
import { getStoreEffectiveFeatures } from "@/lib/profiles/featureResolver";
import type { SupabaseClient } from "@supabase/supabase-js";

const productInputSchema = productFormSchema;

export type ProductInput = ProductFormInput;

async function assertSkuIsFree(
  supabase: SupabaseClient,
  storeId: string,
  sku: string,
  excludeId?: string
) {
  let query = supabase
    .from("products")
    .select("id")
    .eq("store_id", storeId)
    // Case-insensitive, matching the uq_store_sku_case_insensitive index. ilike treats
    // % and _ as wildcards, so escape them to keep this an exact (case-folded) match.
    .ilike("sku", sku.replace(/[\\%_]/g, "\\$&"))
    .limit(1);
  if (excludeId) query = query.neq("id", excludeId);

  const { data } = await query;
  if (data && data.length > 0) {
    throw new Error(`SKU "${sku}" is already used by another product in this store.`);
  }
}

async function assertBarcodeIsFree(
  supabase: SupabaseClient,
  storeId: string,
  barcode: string | null,
  excludeId?: string
) {
  if (!barcode) return;

  let query = supabase
    .from("products")
    .select("id")
    .eq("store_id", storeId)
    .eq("barcode", barcode)
    .limit(1);
  if (excludeId) query = query.neq("id", excludeId);

  const { data } = await query;
  if (data && data.length > 0) {
    throw new Error(`Barcode "${barcode}" is already used by another product in this store.`);
  }
}

export type ActionResult<T = undefined> =
  | ({ success: true } & (T extends undefined ? object : T))
  | { success: false; error: string };

/**
 * Returns a result object rather than throwing: a "use server" action that throws has its
 * error `message` redacted to an opaque digest once deployed (Next.js strips it in production
 * builds — this only surfaces on Vercel, not `next dev`, which is why it went unnoticed).
 * Returning the message as data sidesteps that entirely. See ProductSheet.tsx's caller.
 */
export async function createProduct(input: ProductInput): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = productInputSchema.parse(input);
    const { supabase, storeId, role } = await requireStoreContext();

    if (role !== "super_admin") {
      const { allow_new_product } = await getStoreEffectiveFeatures(storeId);
      if (!allow_new_product) {
        return { success: false, error: "Product creation is disabled on this store's profile." };
      }
    }

    await assertSkuIsFree(supabase, storeId, parsed.sku);
    await assertBarcodeIsFree(supabase, storeId, parsed.barcode);

    const { data: userResult } = await supabase.auth.getUser();

    const { data: product, error } = await supabase
      .from("products")
      .insert({
        store_id: storeId,
        category_id: parsed.category_id,
        sku: parsed.sku,
        barcode: parsed.barcode,
        name: parsed.name,
        description: parsed.description,
        tags: parsed.tags,
        cost_price: parsed.cost_price,
        retail_price: parsed.retail_price,
        current_stock: parsed.current_stock,
        min_threshold: parsed.min_threshold,
        image_url: parsed.image_url,
        is_active: parsed.is_active,
      })
      .select("id")
      .single();

    if (error) return { success: false, error: error.message };

    // A non-zero starting stock is a receiving event, same as any other
    // restock — it needs the same audit trail so "how did this product get
    // its stock" is always answerable from inventory_logs alone.
    if (parsed.current_stock > 0) {
      const { error: logError } = await supabase.from("inventory_logs").insert({
        store_id: storeId,
        product_id: product.id,
        change_type: "restock",
        quantity: parsed.current_stock,
        previous_stock: 0,
        new_stock: parsed.current_stock,
        notes: "Initial stock on product creation",
        created_by: userResult.user?.id,
      });
      if (logError) return { success: false, error: logError.message };
    }

    revalidatePath("/dashboard/inventory");
    return { success: true, id: product.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

export async function updateProduct(id: string, input: ProductInput) {
  const parsed = productInputSchema.parse(input);
  const { supabase, storeId } = await requireStoreContext();

  await assertSkuIsFree(supabase, storeId, parsed.sku, id);
  await assertBarcodeIsFree(supabase, storeId, parsed.barcode, id);

  const { error } = await supabase
    .from("products")
    .update({
      category_id: parsed.category_id,
      sku: parsed.sku,
      barcode: parsed.barcode,
      name: parsed.name,
      description: parsed.description,
      tags: parsed.tags,
      cost_price: parsed.cost_price,
      retail_price: parsed.retail_price,
      current_stock: parsed.current_stock,
      min_threshold: parsed.min_threshold,
      image_url: parsed.image_url,
      is_active: parsed.is_active,
    })
    .eq("id", id)
    .eq("store_id", storeId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/inventory");
}

/**
 * A hard DELETE fails the moment a product has any history at all —
 * inventory_logs.product_id is a foreign key with no cascade, and the same
 * is true of order_items.product_id — so any product that's ever been
 * restocked, adjusted, or sold (which is effectively every real product,
 * and now every product from the moment it's created, since createProduct
 * logs the initial stock as a restock) can never be hard-deleted. Products
 * already have an `is_active` flag that the POS catalog and inventory
 * queries filter on, so "delete" is a deactivation: it disappears from the
 * catalog and can't be sold, but its audit trail and past orders stay
 * intact, and it can be reactivated later from the product sheet.
 */
export async function deleteProduct(id: string) {
  const { supabase, storeId } = await requireStoreContext();

  const { error } = await supabase
    .from("products")
    .update({ is_active: false })
    .eq("id", id)
    .eq("store_id", storeId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/inventory");
}


/** Next semantic SKU for the active store, e.g. ALT-01-WATCH-01001 (atomic, see generate_next_store_sku). */
export async function generateProductSku(prefix?: string): Promise<string> {
  const { supabase, storeId } = await requireStoreContext();
  const { data, error } = await supabase.rpc("generate_next_store_sku", {
    p_store_id: storeId,
    p_prefix: prefix?.trim() || "SKU",
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Live duplicate check for the manual-entry mode; the unique indexes remain the real guarantee. */
export async function checkProductIdentifiers(input: {
  sku?: string;
  barcode?: string | null;
  excludeId?: string;
}): Promise<{ skuTaken: boolean; barcodeTaken: boolean }> {
  const { supabase, storeId } = await requireStoreContext();
  const [skuTaken, barcodeTaken] = await Promise.all([
    input.sku?.trim()
      ? assertSkuIsFree(supabase, storeId, input.sku.trim(), input.excludeId).then(() => false, () => true)
      : false,
    input.barcode?.trim()
      ? assertBarcodeIsFree(supabase, storeId, input.barcode.trim(), input.excludeId).then(() => false, () => true)
      : false,
  ]);
  return { skuTaken, barcodeTaken };
}

/**
 * Creates a variant parent (a non-sellable container carrying the base SKU) plus one child
 * product per variant, each with its own SKU, barcode, prices and opening stock. Supabase's
 * REST client has no multi-statement transaction, so a failure part-way removes what this call
 * created; the case-insensitive SKU and barcode indexes are the guarantee against duplicates.
 */
export async function createProductWithVariants(
  input: VariantProductInput
): Promise<ActionResult<{ parentId: string; variantCount: number }>> {
 try {
  const parsed = variantProductSchema.parse(input);
  const { supabase, storeId, role } = await requireStoreContext();

  // Part 4 of the spec only guards createProduct()/createCategory() against their matching
  // flag; a variant product is still a product, so it gets the same allow_new_product check
  // (not allow_variant_matrix — that flag exists for the Profile Matrix UI to toggle, but no
  // spec part asked createProductWithVariants to enforce it, and every seeded profile except
  // Lite Register already has allow_new_product on).
  if (role !== "super_admin") {
    const { allow_new_product } = await getStoreEffectiveFeatures(storeId);
    if (!allow_new_product) return { success: false, error: "Product creation is disabled on this store's profile." };
  }

  const { data: userResult } = await supabase.auth.getUser();

  await assertSkuIsFree(supabase, storeId, parsed.sku);
  for (const v of parsed.variants) {
    await assertSkuIsFree(supabase, storeId, v.sku);
    await assertBarcodeIsFree(supabase, storeId, v.barcode);
  }

  const { data: parent, error: parentError } = await supabase
    .from("products")
    .insert({
      store_id: storeId,
      category_id: parsed.category_id,
      sku: parsed.sku,
      barcode: null,
      name: parsed.name,
      description: parsed.description,
      tags: parsed.tags,
      cost_price: parsed.cost_price,
      retail_price: parsed.retail_price,
      current_stock: 0,
      min_threshold: parsed.min_threshold,
      image_url: parsed.image_url,
      is_active: parsed.is_active,
      has_variants: true,
    })
    .select("id")
    .single();
  if (parentError) return { success: false, error: friendlyInsertError(parentError) };

  const { data: children, error: childError } = await supabase
    .from("products")
    .insert(
      parsed.variants.map((v) => ({
        store_id: storeId,
        category_id: parsed.category_id,
        sku: v.sku,
        barcode: v.barcode,
        name: `${parsed.name} — ${Object.values(v.variant_attributes).join(" / ")}`,
        description: parsed.description,
        tags: parsed.tags,
        cost_price: v.cost_price,
        retail_price: v.retail_price,
        current_stock: v.current_stock,
        min_threshold: parsed.min_threshold,
        image_url: parsed.image_url,
        is_active: parsed.is_active,
        parent_id: parent.id,
        variant_attributes: v.variant_attributes,
      }))
    )
    .select("id, sku, current_stock");

  if (childError || !children) {
    await supabase.from("products").delete().eq("id", parent.id);
    return { success: false, error: friendlyInsertError(childError) };
  }

  const logs = children
    .filter((c) => c.current_stock > 0)
    .map((c) => ({
      store_id: storeId,
      product_id: c.id,
      change_type: "restock",
      quantity: c.current_stock,
      previous_stock: 0,
      new_stock: c.current_stock,
      notes: "Initial stock on variant creation",
      created_by: userResult.user?.id,
    }));
  if (logs.length > 0) {
    const { error: logError } = await supabase.from("inventory_logs").insert(logs);
    if (logError) return { success: false, error: logError.message };
  }

  revalidatePath("/dashboard/inventory");
  return { success: true, parentId: parent.id, variantCount: children.length };
 } catch (err) {
  return { success: false, error: err instanceof Error ? err.message : "Something went wrong" };
 }
}

function friendlyInsertError(error: { code?: string; message: string } | null): string {
  if (error?.code === "23505") return "One of the SKUs or barcodes is already used by another product in this store.";
  return error?.message ?? "Could not create the variants";
}
