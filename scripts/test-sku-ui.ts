#!/usr/bin/env -S npx tsx
/**
 * SKU / barcode / variant UI QA.  Needs the app running (BASE_URL, default http://localhost:3000)
 * and supabase/sku_barcode_architecture.sql applied:   npm run test:sku-ui
 * Creates TC-UI* products in the demo store as the demo store manager and removes them afterwards
 * (a direct pg connection with the ledger guard bypassed, because opening stock writes immutable
 * inventory_logs rows).
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { validateGs1Barcode } from "../lib/utils/gs1Validator";
import { abbreviateOption, buildVariantRows, countCombinations, suffixFor, variantProductSchema, variantSku } from "../lib/products/variants";

for (const f of [".env.local", ".env"]) {
  const full = path.join(process.cwd(), f);
  if (fs.existsSync(full)) process.loadEnvFile(full);
}
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const results: { id: string; pass: boolean }[] = [];
const record = (id: string, name: string, pass: boolean, detail: string) => {
  results.push({ id, pass });
  console.log(`[${id}] [${name}] - ${pass ? "PASS" : "FAIL"}: ${detail}`);
};

async function openNewProduct(page: Page) {
  await page.goto(`${BASE_URL}/dashboard/inventory`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /New product/ }).first().click();
  await page.locator("#product-name").waitFor();
  await page.waitForTimeout(400);
}
const save = async (page: Page) => {
  await page.getByRole("button", { name: "Create product" }).click();
  await page.locator("#product-name").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
};

async function main() {
  // ---- pure logic -------------------------------------------------------------------------
  const cases: [string, boolean, string][] = [
    ["036000291452", true, "UPC-A"], ["036000291453", false, "UPC-A"],
    ["4006381333931", true, "EAN-13"], ["4006381333932", false, "EAN-13"],
    ["96385074", true, "EAN-8"], ["96385075", false, "EAN-8"],
    ["ABC-123", true, "Custom"], ["12345", true, "Custom"], ["", true, "Custom"],
  ];
  const bad = cases.filter(([b, ok, t]) => { const r = validateGs1Barcode(b); return r.isValid !== ok || r.type !== t; });
  record("TC-SKUUI-01", "GS1 validator", bad.length === 0, bad.length ? `wrong: ${bad.map((b) => b[0])}` : `${cases.length} cases (UPC-A, EAN-13, EAN-8, custom) classified and checksummed correctly`);

  const options = [{ name: "Color", values: ["Black", "Silver"] }, { name: "Size", values: ["S", "M", "L"] }];
  const rows = buildVariantRows(options, [], { retail_price: "10", cost_price: "4" });
  const skus = rows.map((r) => variantSku("watch-1", r));
  const edited = rows.map((r, i) => (i === 0 ? { ...r, current_stock: "7", skuOverride: "CUSTOM-1" } : r));
  const regenerated = buildVariantRows([{ ...options[0], values: [...options[0].values, "Gold"] }, options[1]], edited, { retail_price: "10", cost_price: "4" });
  const kept = regenerated.find((r) => r.key === rows[0].key);
  const combosOk = countCombinations(options) === 6 && rows.length === 6 && regenerated.length === 9;
  record("TC-SKUUI-02", "Variant matrix", combosOk && skus[0] === "WATCH-1-BLK-S" && skus[5] === "WATCH-1-SLV-L" && new Set(skus).size === 6 && kept?.current_stock === "7" && abbreviateOption("Midnight Blue") === "MDN" && suffixFor(options, rows[1].attributes) === "BLK-M",
    `6 permutations, e.g. ${skus[0]}, ${skus[5]}; regenerating with a new value keeps edits (${kept?.current_stock}/${kept?.skuOverride})`);

  const dupSchema = variantProductSchema.safeParse({ name: "X", sku: "a-1", category_id: null, cost_price: 1, retail_price: 2, min_threshold: null, variants: [
    { sku: "A-1", retail_price: 1, cost_price: 1, current_stock: 0, variant_attributes: {} }] });
  const badBarcode = variantProductSchema.safeParse({ name: "X", sku: "a-1", category_id: null, cost_price: 1, retail_price: 2, min_threshold: null, variants: [
    { sku: "A-2", barcode: "4006381333932", retail_price: 1, cost_price: 1, current_stock: 0, variant_attributes: {} }] });
  record("TC-SKUUI-03", "Variant payload validation", !dupSchema.success && !badBarcode.success, `parent/variant SKU clash (case-insensitive) rejected=${!dupSchema.success}, bad check digit rejected=${!badBarcode.success}`);

  // ---- browser ---------------------------------------------------------------------------------
  const { data: mgr } = await admin.from("profiles").select("store_id").eq("email", "manager@malldemo.com").single();
  const storeId = mgr!.store_id as string;
  const { data: store } = await admin.from("stores").select("code").eq("id", storeId).single();
  // A known existing SKU (mixed case on purpose) to prove the duplicate check ignores case.
  const existing = { sku: "TC-UI-Exist-1" };
  await admin.from("products").insert({ store_id: storeId, sku: existing.sku, name: "TC-UI Existing", retail_price: 1, cost_price: 1 });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Store Manager" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  const pg = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();

  try {
    // automated mask
    await openNewProduct(page);
    await page.locator("#product-name").fill("TC-UI Auto");
    await page.getByLabel("SKU prefix").fill("tcui");
    await page.getByTestId("generate-sku-btn").click();
    await page.waitForFunction(() => /-TCUI-\d{5}$/.test((document.querySelector("#product-sku") as HTMLInputElement)?.value ?? ""), null, { timeout: 8000 }).catch(() => {});
    const generated = await page.locator("#product-sku").inputValue();
    await save(page);
    const { data: autoRow } = await admin.from("products").select("sku, has_variants").eq("store_id", storeId).eq("sku", generated).maybeSingle();
    record("TC-SKUUI-04", "Automated taxonomy mask", new RegExp(`^${store!.code}-TCUI-\\d{5}$`).test(generated) && !!autoRow, `generated ${generated}, saved row found=${!!autoRow}`);

    // manual entry: uppercase + live duplicate check
    await openNewProduct(page);
    await page.getByTestId("sku-mode-manual").click();
    await page.locator("#product-sku").fill(existing!.sku.toLowerCase());
    const taken = await page.getByTestId("sku-taken").waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
    const upper = (await page.locator("#product-sku").inputValue()) === existing!.sku.toLowerCase().toUpperCase();
    await page.locator("#product-sku").fill("tc-ui-free-1");
    const free = await page.getByTestId("sku-free").waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
    record("TC-SKUUI-05", "Manual entry", taken && upper && free, `auto-capitalised=${upper}, duplicate flagged=${taken}, unused SKU shows Available=${free}`);

    // scanner burst must not corrupt the focused field
    await openNewProduct(page);
    await page.getByTestId("sku-mode-scan").click();
    await page.locator("#product-name").click();
    await page.keyboard.type("Wat", { delay: 120 });
    await page.waitForTimeout(250); // a person pauses before scanning
    await page.keyboard.type("5901234123457", { delay: 4 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    const nameAfter = await page.locator("#product-name").inputValue();
    const barcode = await page.locator("#product-barcode").inputValue();
    const stillOpen = await page.locator("#product-name").isVisible();
    // ordinary typing must NOT be treated as a scan
    await page.locator("#product-name").fill("");
    await page.keyboard.type("abcdefgh", { delay: 110 });
    const typed = await page.locator("#product-name").inputValue();
    record("TC-SKUUI-06", "Scanner burst isolation", nameAfter === "Wat" && barcode === "5901234123457" && stillOpen && typed === "abcdefgh",
      `name kept "${nameAfter}", barcode filled "${barcode}", form not submitted=${stillOpen}, slow human typing untouched="${typed}"`);

    // variants
    await openNewProduct(page);
    await page.getByTestId("sku-mode-manual").click();
    await page.locator("#product-name").fill("TC-UI Tee");
    await page.locator("#product-sku").fill("tcuitee");
    await page.locator("#product-retail").fill("25");
    await page.locator("#product-cost").fill("10");
    await page.getByTestId("has-variants").click();
    await page.getByLabel("Color values").fill("Black, Silver");
    await page.getByLabel("Color values").press("Enter");
    await page.getByLabel("Size values").fill("S, M");
    await page.getByLabel("Size values").press("Enter");
    const rowCount = await page.getByTestId("variant-row").count();
    const firstSku = await page.getByLabel("SKU for Black S").inputValue();
    await page.getByLabel("current stock for Black S").fill("12");
    await page.getByLabel("Barcode for Black S").fill("4006381333931");
    await page.getByLabel("retail price for Silver M").fill("30");
    await save(page);
    const { data: parent } = await admin.from("products").select("id, has_variants, current_stock").eq("store_id", storeId).eq("sku", "TCUITEE").maybeSingle();
    const { data: kids } = await admin.from("products").select("id, sku, barcode, retail_price, current_stock, variant_attributes, parent_id, name").eq("parent_id", parent?.id ?? "00000000-0000-0000-0000-000000000000").order("sku");
    const black = kids?.find((k) => k.sku === "TCUITEE-BLK-S");
    const silverM = kids?.find((k) => k.sku === "TCUITEE-SLV-M");
    const { data: logs } = await admin.from("inventory_logs").select("quantity").eq("product_id", black?.id ?? "");
    const pass = rowCount === 4 && firstSku === "TCUITEE-BLK-S" && parent?.has_variants === true && kids?.length === 4 &&
      black?.current_stock === 12 && black?.barcode === "4006381333931" && Number(silverM?.retail_price) === 30 &&
      black?.variant_attributes && (black.variant_attributes as Record<string, string>).Color === "Black";
    record("TC-SKUUI-07", "Variant matrix end-to-end", !!pass, `${rowCount} rows, first SKU ${firstSku}; parent container=${parent?.has_variants}, ${kids?.length} children, per-variant stock/barcode/price saved (BLK-S stock=${black?.current_stock}, SLV-M price=${silverM?.retail_price}), name "${black?.name}"`);

    // parents stay out of the sellable catalog
    await page.goto(`${BASE_URL}/dashboard/inventory`, { waitUntil: "networkidle" });
    const parentListed = await page.getByText("TCUITEE", { exact: true }).count();
    const childListed = await page.getByText("TCUITEE-BLK-S").count();
    record("TC-SKUUI-08", "Parent hidden, variants listed", parentListed === 0 && childListed > 0, `parent rows=${parentListed}, variant rows=${childListed}`);
  } finally {
    console.log("Cleaning up TC-UI products...");
    await pg.query("select set_config('app.bypass_ledger_guard','on',false)");
    await pg.query("delete from inventory_logs where product_id in (select id from products where store_id=$1 and (name like 'TC-UI%' or sku like 'TCUI%' or sku like '%-TCUI-%'))", [storeId]);
    await pg.query("delete from products where store_id=$1 and parent_id is not null and (name like 'TC-UI%')", [storeId]);
    await pg.query("delete from products where store_id=$1 and (name like 'TC-UI%' or sku like 'TCUI%' or sku like '%-TCUI-%')", [storeId]);
    await pg.end();
    await browser.close();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
