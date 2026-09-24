#!/usr/bin/env -S npx tsx
/**
 * Sign-out / terminal-lock / cart-parking QA. Needs the app running
 * (BASE_URL, default http://localhost:3000):  npm run test:logout
 * Uses the demo accounts; signs out only its own browser sessions.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import "./_help-env";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const results: { id: string; pass: boolean }[] = [];

function record(id: string, name: string, pass: boolean, detail: string) {
  results.push({ id, pass });
  console.log(`[${id}] [${name}] - ${pass ? "PASS" : "FAIL"}: ${detail}`);
}

async function loginContext(browser: Browser, label: string, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  return { context, page };
}

async function confirmSignOut(page: Page) {
  await page.keyboard.press("Alt+KeyL");
  await page.getByTestId("logout-dialog").waitFor({ timeout: 5000 });
  await page.getByTestId("confirm-signout-btn").click();
}

async function tc01(browser: Browser) {
  const { context, page } = await loginContext(browser, "Store Manager");
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  const header = await page.getByTestId("user-menu-trigger").boundingBox();
  const sidebar = await page.getByTestId("sidebar-signout").boundingBox();
  const pass = !!header && !!sidebar && header.width >= 44 && header.height >= 44 && sidebar.width >= 44 && sidebar.height >= 44;
  record("TC-LOGOUT-01", "Touch target dimensions", pass, `header avatar ${header?.width}x${header?.height}, sidebar sign-out ${sidebar?.width}x${sidebar?.height}`);
  await context.close();
}

async function tc02(browser: Browser) {
  const { context, page } = await loginContext(browser, "Store Manager");
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  // Offline so the sync engine can't replay (and consume) the fake entry.
  await context.setOffline(true);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("MallRetailOfflineDB");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("offline_orders_queue", "readwrite");
          tx.objectStore("offline_orders_queue").put({
            idempotency_key: "tc-logout-02",
            store_id: "x",
            cashier_id: "x",
            session_id: "x",
            payload: {},
            created_at: new Date().toISOString(),
            sync_status: "pending",
            retry_count: 0,
          });
          tx.oncomplete = () => {
            open.result.close();
            resolve();
          };
        };
      })
  );
  await page.keyboard.press("Alt+KeyL");
  await page.getByTestId("logout-dialog").waitFor({ timeout: 5000 });
  const banner = page.getByTestId("logout-warning-queue");
  const text = (await banner.textContent().catch(() => "")) ?? "";
  const pass = /CRITICAL/.test(text) && /1 pending offline transactions/.test(text);
  record("TC-LOGOUT-02", "Unsynced queue warning", pass, pass ? "red CRITICAL banner shows 1 pending offline transaction" : `banner text: "${text}"`);
  await context.close();
}

async function tc03(browser: Browser) {
  const { context, page } = await loginContext(browser, "Cashier");
  await page.goto(`${BASE_URL}/pos`, { waitUntil: "networkidle" });
  const card = page.locator('[data-tour="pos-product-card"] button:not([disabled])').first();
  await card.click();
  await card.click();
  await page.keyboard.press("Control+Shift+KeyQ");
  await page.getByTestId("logout-dialog").waitFor({ timeout: 5000 });
  const cartWarning = (await page.getByTestId("logout-warning-cart").textContent()) ?? "";
  await page.getByTestId("park-cart-btn").click();
  const locked = await page.getByTestId("terminal-lock").waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  const parked = await page.evaluate(
    () =>
      new Promise<{ lines: number; qty: number } | null>((resolve, reject) => {
        const open = indexedDB.open("MallRetailOfflineDB");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction("parked_carts").objectStore("parked_carts").getAll();
          req.onsuccess = () => {
            const row = req.result[0] as { lines: { quantity: number }[] } | undefined;
            open.result.close();
            resolve(row ? { lines: row.lines.length, qty: row.lines.reduce((s, l) => s + l.quantity, 0) } : null);
          };
        };
      })
  );
  const pass = /2 item\(s\)/.test(cartWarning) && locked && parked?.qty === 2;
  record("TC-LOGOUT-03", "Cart parking", pass, `cartWarning="${cartWarning.trim()}" pinLock=${locked} parkedInIndexedDB=${JSON.stringify(parked)}`);
  await context.close();
}

async function tc04(browser: Browser) {
  const { context, page: tab1 } = await loginContext(browser, "Store Manager");
  await tab1.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  const tab2 = await context.newPage();
  await tab2.goto(`${BASE_URL}/dashboard/inventory`, { waitUntil: "networkidle" });
  await tab1.bringToFront();
  await confirmSignOut(tab1);
  const redirected = await tab2.waitForURL((u) => u.pathname === "/login", { timeout: 8000 }).then(() => true).catch(() => false);
  record("TC-LOGOUT-04", "Multi-tab broadcast", redirected, redirected ? "tab 2 redirected to /login via BroadcastChannel" : `tab 2 stayed on ${tab2.url()}`);
  await context.close();
}

async function tc05(browser: Browser) {
  const { context, page } = await loginContext(browser, "Cashier");
  await page.goto(`${BASE_URL}/pos`, { waitUntil: "networkidle" });

  // Second device: an independent session for the same account.
  const other = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await other.auth.signInWithPassword({ email: "cashier@malldemo.com", password: "demo-cashier" });
  await confirmSignOut(page);
  await page.waitForURL((u) => u.pathname === "/login", { timeout: 10000 });
  const stillValid = await other.auth.getUser();
  const refreshed = await other.auth.refreshSession();
  const source = fs.readFileSync(path.join(process.cwd(), "lib/actions/auth.ts"), "utf8");
  const usesLocal = /signOut\(\{ scope: "local" \}\)/.test(source);
  const pass = !signInError && !!stillValid.data.user && !refreshed.error && usesLocal;
  record("TC-LOGOUT-05", "Local scope isolation", pass, `secondDeviceSession valid=${!!stillValid.data.user} refresh=${refreshed.error ? refreshed.error.message : "ok"} scope:local=${usesLocal}`);
  await context.close();
}

async function tc06(browser: Browser) {
  const { context, page } = await loginContext(browser, "Store Manager");
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  await confirmSignOut(page);
  await page.waitForURL((u) => u.pathname === "/login", { timeout: 10000 });
  await page.goBack({ waitUntil: "commit" }).catch(() => {});
  await page.waitForTimeout(2000);
  const afterBack = new URL(page.url()).pathname;
  await page.goto(`${BASE_URL}/pos`, { waitUntil: "commit" }).catch(() => {});
  await page.waitForTimeout(1500);
  const direct = new URL(page.url()).pathname;
  const pass = afterBack === "/login" && direct === "/login";
  record("TC-LOGOUT-06", "Back-button immunity", pass, `after back(): ${afterBack}; direct /pos: ${direct}`);
  await context.close();
}

async function main() {
  const browser = await chromium.launch();
  try {
    await tc01(browser);
    await tc02(browser);
    await tc03(browser);
    await tc04(browser);
    await tc05(browser);
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
