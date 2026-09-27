#!/usr/bin/env -S npx tsx
/**
 * CSV bulk-import QA for products and categories (lib/actions/bulkImport.ts).
 * Needs the app running (BASE_URL, default http://localhost:3000):
 *   npm run test:bulk-import
 * Drives the real "Import CSV" dialogs (not a reimplementation of the action
 * logic) since requireStoreContext() needs a real Next.js request — same
 * reasoning as scripts/test-store-profiles.ts's TC-PROF-C. Uses a disposable
 * store (TC-BULK-*) and the demo store-manager account, swapped onto it for
 * the duration of the run and restored after.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { chromium, type Browser, type Page } from "playwright";

for (const f of [".env.local", ".env"]) {
  const full = path.join(process.cwd(), f);
  if (fs.existsSync(full)) process.loadEnvFile(full);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results: { id: string; pass: boolean }[] = [];
function record(id: string, name: string, pass: boolean, detail: string) {
  results.push({ id, pass });
  console.log(`[${id}] [${name}] - ${pass ? "PASS" : "FAIL"}: ${detail}`);
}

function csv(rows: string[][]): string {
  return rows.map((r) => r.join(",")).join("\n");
}

/** Swaps the demo store manager onto `storeId` for the duration of `fn`, then swaps them back. */
async function asManagerOfStore<T>(storeId: string, fn: (page: Page) => Promise<T>, browser: Browser): Promise<T> {
  const { data: mgrProfile } = await admin.from("profiles").select("store_id").eq("email", "manager@malldemo.com").single();
  const originalStoreId = mgrProfile!.store_id as string;
  await admin.from("profiles").update({ store_id: storeId }).eq("email", "manager@malldemo.com");
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Store Manager" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    return await fn(page);
  } finally {
    await admin.from("profiles").update({ store_id: originalStoreId }).eq("email", "manager@malldemo.com");
  }
}

async function openImportDialog(page: Page, pagePath: string) {
  await page.goto(`${BASE_URL}${pagePath}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Import CSV" }).first().click();
}

async function uploadCsv(page: Page, testId: string, text: string) {
  await page.locator(`[data-testid="${testId}"]`).setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(text, "utf-8"),
  });
}

async function previewRows(page: Page) {
  await page.getByText(/will be imported/).waitFor({ timeout: 15000 });
  return page.locator("table tbody tr").allTextContents();
}

async function commitAndGetResults(page: Page) {
  await page.getByRole("button", { name: /^Import \d+ row/ }).click();
  await page.getByText(/imported successfully/).waitFor({ timeout: 20000 });
  return page.locator("table tbody tr").allTextContents();
}

async function main() {
  const pg = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  const suffix = Date.now().toString(36).toUpperCase().slice(-5);
  const skuPrefix = `TCBULK-${suffix}`;

  const { data: testStore, error: storeErr } = await admin
    .from("stores")
    .insert({ name: `TC-BULK Store ${suffix}`, code: `tcbulk-${suffix}`, unit_number: "TEST", currency: "USD", locale: "en-US", tax_model: "exclusive" })
    .select("id")
    .single();
  if (storeErr) throw new Error(`store insert: ${storeErr.message}`);
  const storeId = testStore.id as string;

  // Pre-seed an existing top-level category and an existing product SKU so
  // the dry run's DB-collision checks (case-insensitive) have something real
  // to collide against.
  const existingCategoryName = `TCBULK Electronics ${suffix}`;
  const { data: existingCategory } = await admin
    .from("categories")
    .insert({ store_id: storeId, name: existingCategoryName, slug: `tcbulk-electronics-${suffix}`, icon: "Package", default_min_threshold: 5, is_tax_exempt: false })
    .select("id")
    .single();
  await admin.from("products").insert({
    store_id: storeId,
    sku: `${skuPrefix}-EXIST`,
    name: "TCBULK Existing Product",
    cost_price: 1,
    retail_price: 2,
    current_stock: 0,
    is_active: true,
  });

  const browser = await chromium.launch();

  try {
    // --- Products -----------------------------------------------------
    const productsCsv = csv([
      ["name", "sku", "barcode", "category_name", "tags", "description", "cost_price", "retail_price", "current_stock", "min_threshold", "image_url", "is_active"],
      ["TCBULK Valid Product", `${skuPrefix}-P1`, "", existingCategoryName, "promo", "Great product", "5", "10", "3", "", "", "true"],
      ["TCBULK Bad Price", `${skuPrefix}-P2`, "", "", "", "", "-5", "10", "0", "", "", "true"],
      ["TCBULK Dup A", `${skuPrefix}-DUP`, "", "", "", "", "5", "10", "0", "", "", "true"],
      ["TCBULK Dup B", `${skuPrefix}-DUP`, "", "", "", "", "5", "10", "0", "", "", "true"],
      ["TCBULK Existing Collision", `${skuPrefix}-exist`, "", "", "", "", "5", "10", "0", "", "", "true"],
      ["TCBULK Auto SKU 1", "", "", "", "", "", "5", "10", "0", "", "", "true"],
      ["TCBULK Auto SKU 2", "", "", "", "", "", "5", "10", "0", "", "", "true"],
      ["TCBULK New Category Product", `${skuPrefix}-P3`, "", `TCBULK Brand New ${suffix}`, "", "", "5", "10", "0", "", "", "true"],
    ]);

    const productPreview = await asManagerOfStore(
      storeId,
      async (page) => {
        await openImportDialog(page, "/dashboard/inventory");
        await uploadCsv(page, "import-products-file-input", productsCsv);
        const rows = await previewRows(page);
        const commitRows = await commitAndGetResults(page);
        return { rows, commitRows };
      },
      browser
    );

    const rowText = (needle: string) => productPreview.rows.find((r) => r.includes(needle)) ?? "";

    record(
      "TC-BULK-01",
      "Valid row commits with a restock inventory_logs entry",
      rowText("TCBULK Valid Product").includes("Valid") && productPreview.commitRows.some((r) => r.includes("Imported")),
      `preview row: "${rowText("TCBULK Valid Product")}"`
    );

    record(
      "TC-BULK-02",
      "Negative cost price rejected in dry run",
      rowText("TCBULK Bad Price").includes("Invalid") && /Cost must be 0 or more/.test(rowText("TCBULK Bad Price")),
      `preview row: "${rowText("TCBULK Bad Price")}"`
    );

    const dupA = rowText("TCBULK Dup A");
    const dupB = rowText("TCBULK Dup B");
    record(
      "TC-BULK-05",
      "Intra-file duplicate SKU: first valid, second invalid",
      dupA.includes("Valid") && dupB.includes("Invalid"),
      `A: "${dupA}"; B: "${dupB}"`
    );

    record(
      "TC-BULK-04",
      "Case-insensitive SKU collision against an existing product is rejected",
      rowText("TCBULK Existing Collision").includes("Invalid"),
      `preview row: "${rowText("TCBULK Existing Collision")}"`
    );

    const autoRows = productPreview.rows.filter((r) => r.includes("TCBULK Auto SKU"));
    record(
      "TC-BULK-08",
      "Blank-SKU rows are marked Auto-generated and both commit successfully",
      autoRows.every((r) => r.includes("Valid") && r.includes("Auto-generated")),
      `rows: ${autoRows.join(" | ")}`
    );

    record(
      "TC-BULK-06a",
      "category_name resolves to an existing category",
      productPreview.commitRows.some((r) => r.includes("Imported")) &&
        (await admin.from("products").select("category_id").eq("store_id", storeId).eq("sku", `${skuPrefix}-P1`).single()).data
          ?.category_id === existingCategory!.id,
      "checked products.category_id after commit"
    );

    const newCategoryRow = rowText("TCBULK New Category Product");
    record(
      "TC-BULK-09",
      "An unresolved category_name is not rejected — it's auto-created on commit, not blocked",
      newCategoryRow.includes("Valid") && /doesn't exist yet.*will be created/.test(newCategoryRow),
      `preview row: "${newCategoryRow}"`
    );

    const newCategoryRecord = await admin
      .from("categories")
      .select("id")
      .eq("store_id", storeId)
      .eq("name", `TCBULK Brand New ${suffix}`)
      .maybeSingle();
    const newCategoryProduct = await admin
      .from("products")
      .select("category_id")
      .eq("store_id", storeId)
      .eq("sku", `${skuPrefix}-P3`)
      .maybeSingle();
    record(
      "TC-BULK-09b",
      "The auto-created category exists and the product is linked to it",
      !!newCategoryRecord.data?.id && newCategoryProduct.data?.category_id === newCategoryRecord.data.id,
      `category id=${newCategoryRecord.data?.id}, product.category_id=${newCategoryProduct.data?.category_id}`
    );

    // --- Categories -----------------------------------------------------
    const categoriesCsv = csv([
      ["name", "parent_name", "icon", "default_min_threshold", "is_tax_exempt"],
      [`TCBULK Phones ${suffix}`, existingCategoryName.toLowerCase(), "Package", "5", "false"],
      [`TCBULK Shoes Kids ${suffix}`, `TCBULK Shoes ${suffix}`, "Package", "5", "false"],
      [`TCBULK Shoes ${suffix}`, "", "Package", "5", "false"],
      [`TCBULK Orphan ${suffix}`, "TCBULK No Such Parent", "Package", "5", "false"],
    ]);

    const categoryPreview = await asManagerOfStore(
      storeId,
      async (page) => {
        await openImportDialog(page, "/dashboard/categories");
        await uploadCsv(page, "import-categories-file-input", categoriesCsv);
        const rows = await previewRows(page);
        const commitRows = await commitAndGetResults(page);
        return { rows, commitRows };
      },
      browser
    );
    const catRowText = (needle: string) => categoryPreview.rows.find((r) => r.includes(needle)) ?? "";

    record(
      "TC-BULK-06b",
      "parent_name resolves case-insensitively to an existing top-level category",
      catRowText(`TCBULK Phones ${suffix}`).includes("Valid"),
      `preview row: "${catRowText(`TCBULK Phones ${suffix}`)}"`
    );

    record(
      "TC-BULK-06c",
      "Child row referencing an in-file top-level parent resolves and commits under it",
      catRowText(`TCBULK Shoes Kids ${suffix}`).includes("Valid") &&
        categoryPreview.commitRows.filter((r) => r.includes("Imported")).length >= 3,
      `preview row: "${catRowText(`TCBULK Shoes Kids ${suffix}`)}"; commit rows: ${categoryPreview.commitRows.join(" | ")}`
    );

    const shoesKidsCommitted = await admin
      .from("categories")
      .select("id, parent_id")
      .eq("store_id", storeId)
      .eq("name", `TCBULK Shoes Kids ${suffix}`)
      .maybeSingle();
    const shoesParent = await admin
      .from("categories")
      .select("id")
      .eq("store_id", storeId)
      .eq("name", `TCBULK Shoes ${suffix}`)
      .maybeSingle();
    record(
      "TC-BULK-06d",
      "Committed child category's parent_id points at the newly-created parent",
      !!shoesKidsCommitted.data?.parent_id && shoesKidsCommitted.data.parent_id === shoesParent.data?.id,
      `child parent_id=${shoesKidsCommitted.data?.parent_id}, parent id=${shoesParent.data?.id}`
    );

    record(
      "TC-BULK-06e",
      "Row with an unresolvable parent name is rejected",
      catRowText(`TCBULK Orphan ${suffix}`).includes("Invalid") && /not found/.test(catRowText(`TCBULK Orphan ${suffix}`)),
      `preview row: "${catRowText(`TCBULK Orphan ${suffix}`)}"`
    );

    // --- Feature-flag gating -------------------------------------------
    await admin.from("stores").update({ active_profile_id: "profile_lite_pos", custom_feature_overrides: {} }).eq("id", storeId);
    const gatedCsv = csv([
      ["name", "sku", "barcode", "category_name", "tags", "description", "cost_price", "retail_price", "current_stock", "min_threshold", "image_url", "is_active"],
      ["TCBULK Gated", `${skuPrefix}-GATED`, "", "", "", "", "5", "10", "0", "", "", "true"],
    ]);
    const gatedMessage = await asManagerOfStore(
      storeId,
      async (page) => {
        await openImportDialog(page, "/dashboard/inventory");
        await uploadCsv(page, "import-products-file-input", gatedCsv);
        await page.getByText(/disabled on this store's profile/).waitFor({ timeout: 15000 });
        return page.getByText("Import disabled").isVisible();
      },
      browser
    );
    record("TC-BULK-03", "Import blocked with a clear message when allow_new_product is off", gatedMessage, "featureBlocked alert shown");
  } finally {
    console.log("Cleaning up test data...");
    await browser.close();
    await pg.query("select set_config('app.bypass_ledger_guard','on',false)");
    await pg.query("delete from inventory_logs where store_id = $1", [storeId]);
    await pg.query("update products set parent_id = null where store_id = $1", [storeId]);
    await admin.from("products").delete().eq("store_id", storeId);
    await pg.query("update categories set parent_id = null where store_id = $1", [storeId]);
    await admin.from("categories").delete().eq("store_id", storeId);
    await admin.from("stores").delete().eq("id", storeId);
    await pg.end();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
