#!/usr/bin/env -S npx tsx
/**
 * Help Center QA. Needs the app running (BASE_URL, default localhost:3000),
 * supabase/help_center_v2.sql applied and `npm run help:seed` run.
 *   npm run test:help
 *
 * TC-HLP-04 temporarily edits app/pos/page.tsx and always restores it.
 * TC-HLP-05 runs the real capture script against BASE_URL and uploads to
 * Storage. TC-HLP-06 drives the POS UI in Training Mode as the demo cashier.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { chromium, type Browser, type Page } from "playwright";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { adminClient } from "./_help-env";
import { HELP_WORKFLOWS } from "../lib/help/workflows";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const admin = adminClient();
const results: { id: string; pass: boolean }[] = [];

function record(id: string, name: string, pass: boolean, detail: string) {
  results.push({ id, pass });
  console.log(`[${id}] [${name}] - ${pass ? "PASS" : "FAIL"}: ${detail}`);
}

async function loginAs(browser: Browser, label: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  return page;
}

async function openDb(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ ids: string[]; withIllustrations: number }>((resolve, reject) => {
        const req = indexedDB.open("MallRetailOfflineDB");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("offline_help_workflows")) {
            db.close();
            resolve({ ids: [], withIllustrations: 0 });
            return;
          }
          const all = db.transaction("offline_help_workflows").objectStore("offline_help_workflows").getAll();
          all.onsuccess = () => {
            const rows = all.result as { id: string; illustrations: Record<string, string> }[];
            db.close();
            resolve({
              ids: rows.map((r) => r.id),
              withIllustrations: rows.filter((r) => Object.values(r.illustrations ?? {}).every((u) => u.startsWith("data:image/svg+xml;base64,"))).length,
            });
          };
        };
      })
  );
}

async function tc01() {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: authError } = await client.auth.signInWithPassword({
    email: "cashier@malldemo.com",
    password: "demo-cashier",
  });
  if (authError) return record("TC-HLP-01", "Role-gated payload", false, `cashier sign-in failed: ${authError.message}`);
  const { data, error } = await client.from("help_workflows").select("id, allowed_roles");
  const ids = (data ?? []).map((w) => w.id as string);
  const expected = HELP_WORKFLOWS.filter((w) => w.allowed_roles.includes("cashier")).map((w) => w.id).sort();
  const leaked = (data ?? []).filter((w) => !(w.allowed_roles as string[]).includes("cashier"));
  const forbidden = ["wf_layout_builder", "wf_customer_refund", "wf_dead_stock_markdown"].filter((id) => ids.includes(id));
  const pass = !error && leaked.length === 0 && forbidden.length === 0 && JSON.stringify([...ids].sort()) === JSON.stringify(expected);
  record("TC-HLP-01", "Role-gated payload", pass, pass ? `cashier receives ${ids.length} workflows; admin/layout workflows excluded by RLS` : `error=${error?.message} leaked=${leaked.map((l) => l.id)} forbidden=${forbidden} got=${ids}`);
}

async function tc02(browser: Browser) {
  const page = await loginAs(browser, "Cashier");
  await page.goto(`${BASE_URL}/pos`, { waitUntil: "networkidle" });
  const expected = HELP_WORKFLOWS.filter((w) => w.allowed_roles.includes("cashier")).length;
  let cached = { ids: [] as string[], withIllustrations: 0 };
  for (let i = 0; i < 20; i++) {
    cached = await openDb(page);
    if (cached.ids.length >= expected) break;
    await page.waitForTimeout(500);
  }
  await page.context().setOffline(true);
  const offline = await openDb(page);
  await page.keyboard.press("F1");
  const visible = await page.getByTestId("help-wf-wf_barcode_checkout").isVisible().catch(() => false);
  const pass = offline.ids.length === expected && offline.withIllustrations === expected && visible;
  record("TC-HLP-02", "Offline cache", pass, pass ? `${offline.ids.length} workflows with Base64/SVG illustrations readable from IndexedDB offline; drawer renders offline` : `expected=${expected} cached=${offline.ids.length} svg=${offline.withIllustrations} drawerVisible=${visible}`);
  await page.context().close();
}

async function tc03(browser: Browser) {
  const page = await loginAs(browser, "Cashier");
  await page.goto(`${BASE_URL}/pos`, { waitUntil: "networkidle" });
  await page.keyboard.press("F1");
  await page.getByTestId("help-wf-wf_open_till").getByRole("button", { name: "Start Interactive Tour" }).click();
  const card = page.getByTestId("spotlight-card");
  await card.waitFor({ timeout: 5000 });
  let trapped = true;
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab");
    trapped &&= await page.evaluate(() => !!document.activeElement?.closest('[data-testid="spotlight-card"]'));
  }
  await page.keyboard.press("ArrowRight");
  const stepText = await card.textContent();
  const advanced = /Step 2 of/.test(stepText ?? "");
  await page.keyboard.press("ArrowLeft");
  const back = /Step 1 of/.test((await card.textContent()) ?? "");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const closed = (await page.getByTestId("spotlight-card").count()) === 0;
  const pass = trapped && advanced && back && closed;
  record("TC-HLP-03", "Spotlight focus trap + keyboard", pass, `focusTrapped=${trapped} arrowRight=${advanced} arrowLeft=${back} escapeCloses=${closed}`);
  await page.context().close();
}

function runDrift() {
  return spawnSync("npx", ["tsx", "scripts/check-help-drift.ts"], { encoding: "utf8", cwd: process.cwd() });
}

async function tc04() {
  const file = path.join(process.cwd(), "app/pos/page.tsx");
  const original = fs.readFileSync(file, "utf8");
  try {
    const baseline = runDrift();
    fs.writeFileSync(file, original.replace("const DEFAULT_TAX_RATE_PERCENT = 8;", "const DEFAULT_TAX_RATE_PERCENT = 8; // drift-test label change"));
    const drifted = runDrift();
    const { data } = await admin.from("help_workflows").select("id, drift_detected").eq("drift_detected", true);
    fs.writeFileSync(file, original);
    const restored = runDrift();
    const pass = baseline.status === 0 && drifted.status === 2 && /DRIFT WARNING/.test(drifted.stderr) && (data?.length ?? 0) > 0 && restored.status === 0;
    record("TC-HLP-04", "Drift detection", pass, `baseline=${baseline.status} afterEdit=${drifted.status} flagged=${data?.length ?? 0} afterRevert=${restored.status}`);
  } finally {
    fs.writeFileSync(file, original);
    runDrift();
  }
}

async function tc05() {
  const run = spawnSync("npx", ["tsx", "scripts/capture-workflow-screenshots.ts", "--only=wf_barcode_checkout"], { encoding: "utf8", env: { ...process.env, BASE_URL } });
  const { data } = await admin.from("help_workflows").select("steps, drift_detected").eq("id", "wf_barcode_checkout").single();
  const steps = (data?.steps ?? []) as { desktop_image_url: string | null; mobile_image_url: string | null }[];
  const checks: string[] = [];
  let okDesktop = 0;
  let okMobile = 0;
  for (const s of steps) {
    for (const [kind, url, w, h] of [["desktop", s.desktop_image_url, 1280, 800], ["mobile", s.mobile_image_url, 390, 844]] as const) {
      if (!url) continue;
      const res = await fetch(url);
      const buf = Buffer.from(await res.arrayBuffer());
      const meta = await sharp(buf).metadata();
      const valid = res.ok && meta.format === "webp" && buf.length < 150 * 1024 && meta.width === w && meta.height === h;
      if (!valid) checks.push(`${kind} ${url}: ${res.status} ${meta.format} ${meta.width}x${meta.height} ${buf.length}B`);
      else if (kind === "desktop") okDesktop++;
      else okMobile++;
    }
  }
  const pass = run.status === 0 && checks.length === 0 && okDesktop === steps.length && okMobile > 0 && data?.drift_detected === false;
  record("TC-HLP-05", "Screenshot capture", pass, pass ? `${okDesktop} desktop (1280x800) + ${okMobile} mobile (390x844) WebP files, all <150KB` : `exit=${run.status} bad=[${checks.join("; ")}] desktop=${okDesktop}/${steps.length} mobile=${okMobile} ${run.stderr.slice(0, 200)}`);
}

async function count(table: string, storeId: string) {
  const { count: n } = await admin.from(table).select("id", { count: "exact", head: true }).eq("store_id", storeId);
  return n ?? 0;
}

async function tc06(browser: Browser) {
  const { data: cashier } = await admin.from("profiles").select("id, store_id").eq("email", "cashier@malldemo.com").single();
  const storeId = cashier!.store_id as string;
  const tables = ["orders", "inventory_logs"];
  const before = await Promise.all(tables.map((t) => count(t, storeId)));
  const { data: sessionsBefore } = await admin.from("cash_drawer_sessions").select("id").eq("cashier_id", cashier!.id);
  const { data: stockBefore } = await admin.from("products").select("id, current_stock").eq("store_id", storeId).order("id");

  const page = await loginAs(browser, "Cashier");
  await page.goto(`${BASE_URL}/pos`, { waitUntil: "networkidle" });
  await page.keyboard.press("F1");
  await page.getByRole("switch", { name: "Training sandbox" }).click();
  await page.keyboard.press("Escape");
  const banner = await page.getByTestId("training-banner").isVisible();
  if (await page.locator('[data-tour="pos-open-submit"]').count()) await page.locator('[data-tour="pos-open-submit"]').click();
  await page.locator('[data-tour="pos-product-card"] button:not([disabled])').first().click();
  await page.locator('[data-tour="pos-charge-btn"]:visible').first().click();
  await page.locator('[data-tour="checkout-submit"]').click();
  const done = await page.getByText("Sale complete").or(page.getByText(/TRAINING-/)).first().isVisible({ timeout: 8000 }).catch(() => false);
  await page.waitForTimeout(1500);

  const after = await Promise.all(tables.map((t) => count(t, storeId)));
  const { data: sessionsAfter } = await admin.from("cash_drawer_sessions").select("id").eq("cashier_id", cashier!.id);
  const { data: stockAfter } = await admin.from("products").select("id, current_stock").eq("store_id", storeId).order("id");
  const unchanged =
    JSON.stringify(before) === JSON.stringify(after) &&
    sessionsBefore?.length === sessionsAfter?.length &&
    JSON.stringify(stockBefore) === JSON.stringify(stockAfter);
  const pass = banner && done && unchanged;
  record("TC-HLP-06", "Training sale isolation", pass, `banner=${banner} saleCompleted=${done} orders/inventory_logs ${before}->${after} sessions ${sessionsBefore?.length}->${sessionsAfter?.length} stockUnchanged=${JSON.stringify(stockBefore) === JSON.stringify(stockAfter)}`);
  await page.context().close();
}

async function main() {
  const { count: seeded } = await admin.from("help_workflows").select("id", { count: "exact", head: true });
  if (seeded !== HELP_WORKFLOWS.length) throw new Error(`Expected ${HELP_WORKFLOWS.length} seeded workflows, found ${seeded}. Run: npm run help:seed`);
  const browser = await chromium.launch();
  try {
    await tc01();
    await tc02(browser);
    await tc03(browser);
    await tc04();
    await tc05();
    await tc06(browser);
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
