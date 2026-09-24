#!/usr/bin/env -S npx tsx
/**
 * SKU & barcode architecture QA.   npm run test:sku
 *
 * Needs supabase/sku_barcode_architecture.sql applied and, for TC-SKU-04/05, the app running
 * (BASE_URL, default http://localhost:3000) — those two drive the real product form as the demo
 * store manager. DB cases use disposable stores (TC-SKU *) via the service role + direct pg;
 * TC-SKU-04/05 leave nothing behind (their TC-SKU-* products are removed through pg with the
 * ledger guard bypassed, since opening stock writes immutable inventory_logs).
 *
 *   01-05  the acceptance cases
 *   06-14  supporting checks: schema, per-store counters, LPAD overflow, barcode uniqueness,
 *          variant hierarchy, RPC authorization, counter lockdown, POS index
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { validateGs1Barcode } from "../lib/utils/gs1Validator";

for (const f of [".env.local", ".env"]) {
  const full = path.join(process.cwd(), f);
  if (fs.existsSync(full)) process.loadEnvFile(full);
}
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const results: { id: string; pass: boolean }[] = [];
const record = (id: string, name: string, pass: boolean, detail: string) => {
  results.push({ id, pass });
  console.log(`[${id}] [${name}] - ${pass ? "PASS" : "FAIL"}: ${detail}`);
};
const userClient = async (email: string, password: string) => {
  const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return c;
};
const product = (storeId: string, sku: string, extra: Record<string, unknown> = {}) =>
  admin.from("products").insert({ store_id: storeId, sku, name: `TC ${sku}`, retail_price: 1, cost_price: 1, ...extra }).select("id").single();

async function main() {
  const pg = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  const suffix = Date.now().toString(36).toUpperCase().slice(-5);
  const mk = async (name: string, code: string) => {
    const { data, error } = await admin.from("stores").insert({ name, code, unit_number: "TEST", currency: "USD", locale: "en-US", tax_model: "exclusive" }).select("id").single();
    if (error) throw new Error(`store insert: ${error.message}`);
    return data.id as string;
  };
  const storeA = await mk(`TC-SKU A ${suffix}`, `tca-${suffix}`.toLowerCase());
  const storeB = await mk(`TC-SKU B ${suffix}`, `TCB-${suffix}`);
  const storeC = await mk(`TC-SKU C ${suffix}`, `TCC-${suffix}`);
  const { data: demoStore } = await admin.from("stores").select("id").eq("code", "DEMO-01").single();
  const demoId = demoStore!.id as string;
  const { data: hadCounter } = await admin.from("store_sku_counters").select("store_id").eq("store_id", demoId);

  try {
    // TC-SKU-01: five parallel calls → five distinct, sequential SKUs
    const five = await Promise.all(Array.from({ length: 5 }, () => admin.rpc("generate_next_store_sku", { p_store_id: storeC, p_prefix: "APX" })));
    const fiveSkus = five.map((r) => r.data as string);
    const seq = fiveSkus.map((s) => Number(s?.split("-").pop())).sort((a, b) => a - b);
    record("TC-SKU-01", "Atomic sequence safety", five.every((r) => !r.error) && new Set(fiveSkus).size === 5 && seq.every((n, i) => n === 1001 + i),
      `5 parallel calls → ${new Set(fiveSkus).size} distinct, sequence ${seq.map((n) => String(n).padStart(5, "0")).join(",")}, errors=${five.filter((r) => r.error).length}`);

    // TC-SKU-02: apx-wat-001 must collide with APX-WAT-001 in the same store
    const upper = await product(storeA, "APX-WAT-001");
    const lower = await product(storeA, "apx-wat-001");
    const otherStore = await product(storeB, "apx-wat-001");
    record("TC-SKU-02", "Case-insensitive uniqueness", !upper.error && lower.error?.code === "23505" && !otherStore.error,
      `APX-WAT-001 inserted=${!upper.error}; apx-wat-001 same store → ${lower.error?.code} (${lower.error?.message?.match(/"[^"]+"/)?.[0] ?? ""}); other store allowed=${!otherStore.error}`);

    // TC-SKU-03: GS1 checksum
    const good = validateGs1Barcode("4006381333931");
    const badOne = validateGs1Barcode("4006381333932");
    record("TC-SKU-03", "GS1 checksum integrity", good.isValid && good.type === "EAN-13" && !badOne.isValid, `4006381333931 → ${good.isValid} (${good.type}); 4006381333932 → ${badOne.isValid}`);

    // TC-SKU-04 / 05 drive the real product form
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Store Manager" }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
      const open = async () => {
        await page.goto(`${BASE_URL}/dashboard/inventory`, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: /New product/ }).first().click();
        await page.locator("#product-name").waitFor();
        await page.waitForTimeout(400);
      };

      // TC-SKU-04: 2 colors × 3 sizes → 6 children
      await open();
      await page.getByTestId("sku-mode-manual").click();
      await page.locator("#product-name").fill("TC-SKU Tee");
      await page.locator("#product-sku").fill("tcskutee");
      await page.locator("#product-retail").fill("20");
      await page.getByTestId("has-variants").click();
      await page.getByLabel("Color values").fill("Black, Silver");
      await page.getByLabel("Color values").press("Enter");
      await page.getByLabel("Size values").fill("S, M, L");
      await page.getByLabel("Size values").press("Enter");
      const rowCount = await page.getByTestId("variant-row").count();
      await page.getByRole("button", { name: "Create product" }).click();
      await page.locator("#product-name").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
      const { data: parent } = await admin.from("products").select("id, has_variants").eq("store_id", demoId).eq("sku", "TCSKUTEE").maybeSingle();
      const { data: kids } = await admin.from("products").select("sku, parent_id").eq("parent_id", parent?.id ?? "00000000-0000-0000-0000-000000000000").order("sku");
      const kidSkus = (kids ?? []).map((k) => k.sku as string);
      const expected = ["BLK", "SLV"].flatMap((c) => ["S", "M", "L"].map((s) => `TCSKUTEE-${c}-${s}`)).sort();
      record("TC-SKU-04", "Variant matrix generation", rowCount === 6 && parent?.has_variants === true && kids?.length === 6 && new Set(kidSkus).size === 6 && (kids ?? []).every((k) => k.parent_id === parent?.id) && JSON.stringify(kidSkus) === JSON.stringify(expected),
        `${rowCount} rows built, ${kids?.length} children saved with parent_id=${parent?.id?.slice(0, 8)}…, unique SKUs: ${kidSkus.join(", ")}`);

      // TC-SKU-05: 20ms-interval burst + Enter reaches the hook
      await open();
      await page.getByTestId("sku-mode-scan").click();
      await page.locator("#product-name").click();
      await page.keyboard.type("Wat", { delay: 120 });
      await page.waitForTimeout(250);
      await page.keyboard.type("5901234123457", { delay: 20 });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
      const barcode = await page.locator("#product-barcode").inputValue();
      const name = await page.locator("#product-name").inputValue();
      const formStillOpen = await page.locator("#product-name").isVisible();
      record("TC-SKU-05", "Hardware scanner burst timing", barcode === "5901234123457" && name === "Wat" && formStillOpen,
        `20ms keystrokes + Enter → scan callback filled barcode "${barcode}"; focused Name field left as "${name}"; form not submitted=${formStillOpen}`);
    } finally {
      await browser.close();
    }

    // ---- supporting checks ------------------------------------------------------------------
    const idx = await pg.query("select indexname from pg_indexes where tablename='products'");
    const names = idx.rows.map((r) => r.indexname);
    const cons = (await pg.query("select conname from pg_constraint where conrelid='public.products'::regclass")).rows.map((r) => r.conname);
    const cols = (await pg.query("select column_name from information_schema.columns where table_name='products'")).rows.map((r) => r.column_name);
    record("TC-SKU-06", "Schema", ["uq_store_sku_case_insensitive", "uq_store_barcode", "idx_products_pos_lookup"].every((n) => names.includes(n)) &&
      !cons.includes("uq_product_store_sku") && !cons.includes("uq_product_store_barcode") && ["has_variants", "parent_id", "variant_attributes"].every((c) => cols.includes(c)),
      `indexes present, legacy constraints dropped=${!cons.includes("uq_product_store_sku")}`);

    const N = 60;
    const calls = await Promise.all(Array.from({ length: N }, () => admin.rpc("generate_next_store_sku", { p_store_id: storeA, p_prefix: "wa-tch!" })));
    const skus = calls.map((c) => c.data as string);
    const nums = skus.map((s) => Number(s?.split("-").pop())).sort((a, b) => a - b);
    record("TC-SKU-07", "Sequence under heavier load", calls.every((c) => !c.error) && new Set(skus).size === N && nums.every((n, i) => n === 1001 + i) && new RegExp(`^TCA-${suffix}-WATCH-\\d{5}$`).test(skus[0]),
      `${N} parallel calls → ${new Set(skus).size} unique, contiguous, prefix cleaned (e.g. ${skus[0]})`);

    const b1 = await admin.rpc("generate_next_store_sku", { p_store_id: storeB, p_prefix: "  " });
    record("TC-SKU-08", "Per-store counter + prefix fallback", b1.data === `TCB-${suffix}-GEN-01001`, `store B first SKU = ${b1.data}`);

    await admin.from("store_sku_counters").update({ last_sequence: 99998 }).eq("store_id", storeB);
    const wide: string[] = [];
    for (let i = 0; i < 3; i++) wide.push((await admin.rpc("generate_next_store_sku", { p_store_id: storeB, p_prefix: "X" })).data as string);
    record("TC-SKU-09", "No LPAD truncation", wide.join() === [`TCB-${suffix}-X-99999`, `TCB-${suffix}-X-100000`, `TCB-${suffix}-X-100001`].join(), wide.join(", "));

    const bcOk = [await product(storeA, "BC-1", { barcode: "4006381333931" }), await product(storeA, "BC-2", { barcode: "" }), await product(storeA, "BC-3", { barcode: "" }), await product(storeA, "BC-4", { barcode: null }), await product(storeA, "BC-5", { barcode: null }), await product(storeB, "BC-1", { barcode: "4006381333931" })];
    const bcDup = await product(storeA, "BC-6", { barcode: "4006381333931" });
    record("TC-SKU-10", "Barcode uniqueness", bcOk.every((r) => !r.error) && bcDup.error?.code === "23505", `blank/NULL repeats ok, duplicate real barcode → ${bcDup.error?.code}, same barcode in another store ok=${!bcOk[5].error}`);

    const parent = await product(storeA, "PARENT-1", { has_variants: true });
    const child = await product(storeA, "PARENT-1-RED", { parent_id: parent.data!.id, variant_attributes: { color: "Red" } });
    const selfParent = await pg.query("update products set parent_id = id where id = $1", [parent.data!.id]).then(() => "allowed", (e) => e.code);
    const delParent = await admin.from("products").delete().eq("id", parent.data!.id);
    record("TC-SKU-11", "Variant hierarchy", !child.error && selfParent === "23514" && delParent.error?.code === "23503", `self-parent → ${selfParent}, delete parent with variant → ${delParent.error?.code}`);

    const cashier = await userClient("cashier@malldemo.com", "demo-cashier");
    const manager = await userClient("manager@malldemo.com", "demo-store-manager");
    const superAdmin = await userClient("superadmin@malldemo.com", "demo-super-admin");
    const cashierTry = await cashier.rpc("generate_next_store_sku", { p_store_id: demoId, p_prefix: "T" });
    const managerOther = await manager.rpc("generate_next_store_sku", { p_store_id: storeA, p_prefix: "T" });
    const managerOwn = await manager.rpc("generate_next_store_sku", { p_store_id: demoId, p_prefix: "T" });
    const adminAny = await superAdmin.rpc("generate_next_store_sku", { p_store_id: storeA, p_prefix: "T" });
    record("TC-SKU-12", "RPC authorization", cashierTry.error?.code === "42501" && managerOther.error?.code === "42501" && !managerOwn.error && !adminAny.error,
      `cashier→${cashierTry.error?.code}, manager other store→${managerOther.error?.code}, manager own ok=${!managerOwn.error}, super_admin any ok=${!adminAny.error}`);

    const direct = await manager.from("store_sku_counters").select("*");
    record("TC-SKU-13", "Counter table locked down", (direct.data?.length ?? 0) === 0, `manager direct select rows=${direct.data?.length ?? 0}`);

    await pg.query("set enable_seqscan = off");
    const plan = (await pg.query("explain select name, retail_price, current_stock, has_variants from products where store_id = $1 and barcode = '4006381333931'", [storeA])).rows.map((r) => r["QUERY PLAN"]).join("\n");
    await pg.query("reset enable_seqscan");
    record("TC-SKU-14", "POS lookup uses an index", /Index (Only )?Scan/.test(plan), plan.split("\n")[0].trim());
  } finally {
    console.log("Cleaning up test data...");
    await pg.query("select set_config('app.bypass_ledger_guard','on',false)");
    await pg.query("delete from inventory_logs where product_id in (select id from products where store_id = any($1) and (sku like 'TCSKU%'))", [[demoId]]);
    await pg.query("delete from products where store_id = $1 and sku like 'TCSKU%' and parent_id is not null", [demoId]);
    await pg.query("delete from products where store_id = $1 and sku like 'TCSKU%'", [demoId]);
    await pg.query("update products set parent_id = null where store_id = any($1)", [[storeA, storeB, storeC]]);
    await pg.query("delete from products where store_id = any($1)", [[storeA, storeB, storeC]]);
    await pg.query("delete from stores where id = any($1)", [[storeA, storeB, storeC]]);
    if (!hadCounter?.length) await pg.query("delete from store_sku_counters where store_id = $1", [demoId]);
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
