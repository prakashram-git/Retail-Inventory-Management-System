#!/usr/bin/env -S npx tsx
/**
 * State-aware sign-out dialog QA. Needs the app running (BASE_URL, default
 * http://localhost:3000):  npm run test:logout-enhanced
 * Mocks are per browser context: a fake IndexedDB queue row and a stubbed
 * cash_drawer_sessions response — no database rows are created.
 */
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import "./_help-env";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const results: { id: string; pass: boolean }[] = [];
function record(id: string, name: string, pass: boolean, detail: string) {
  results.push({ id, pass });
  console.log(`[${id}] [${name}] - ${pass ? "PASS" : "FAIL"}: ${detail}`);
}

async function login(browser: Browser, label: string, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  return { context, page };
}

/** Offline so the sync engine can't replay (and consume) the fake row. */
async function mockPendingQueue(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("MallRetailOfflineDB");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("offline_orders_queue", "readwrite");
          tx.objectStore("offline_orders_queue").put({
            idempotency_key: "tc-enhanced-queue",
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
}

const openDialog = async (page: Page) => {
  await page.keyboard.press("Alt+KeyL");
  await page.getByTestId("logout-dialog").waitFor({ timeout: 6000 });
};

async function tc01(browser: Browser) {
  const { context, page } = await login(browser, "Store Manager");
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  await openDialog(page);
  await page.waitForTimeout(300);
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
  // Enter on the default-focused control must dismiss, not sign out.
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const stillSignedIn = new URL(page.url()).pathname.startsWith("/dashboard");
  const closed = (await page.getByTestId("logout-dialog").count()) === 0;
  const pass = focused === "Stay Signed In" && stillSignedIn && closed;
  record("TC-LOGOUT-01", "Default focus", pass, `focused="${focused}" Enter→dismissed=${closed} stillSignedIn=${stillSignedIn}`);
  await context.close();
}

async function tc02(browser: Browser) {
  const { context, page } = await login(browser, "Store Manager");
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  await mockPendingQueue(context, page);
  await openDialog(page);
  const banner = (await page.getByTestId("logout-warning-queue").textContent()) ?? "";
  const btn = page.getByTestId("confirm-signout-btn");
  const disabledBefore = await btn.isDisabled();
  const syncBtn = await page.getByTestId("sync-now-btn").count();
  await page.getByTestId("logout-override").click();
  const enabledAfter = await btn.isEnabled();
  await page.getByTestId("logout-override").click();
  const disabledAgain = await btn.isDisabled();
  const pass = /CRITICAL: You have 1 pending offline transactions waiting to sync to the server\./.test(banner) && disabledBefore && enabledAfter && disabledAgain && syncBtn === 1;
  record("TC-LOGOUT-02", "Unsynced queue block", pass, `banner=${/CRITICAL/.test(banner)} disabledUntilChecked=${disabledBefore} enabledAfterCheck=${enabledAfter} reDisabledOnUncheck=${disabledAgain} syncNow=${syncBtn}`);
  await context.close();
}

async function tc03(browser: Browser) {
  const { context, page } = await login(browser, "Cashier");
  await page.goto(`${BASE_URL}/pos`, { waitUntil: "networkidle" });
  const card = page.locator('[data-tour="pos-product-card"] button:not([disabled])').first();
  await card.click();
  await card.click();
  await page.locator('[data-tour="pos-cart"]:visible').getByText("2", { exact: true }).first().waitFor({ timeout: 5000 });
  await openDialog(page);
  const cartText = (await page.getByTestId("logout-warning-cart").textContent()) ?? "";
  await page.getByRole("button", { name: "Park Cart & Lock" }).click();
  const locked = await page.getByTestId("terminal-lock").waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  const parked = await page.evaluate(
    () =>
      new Promise<number | null>((resolve, reject) => {
        const open = indexedDB.open("MallRetailOfflineDB");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction("parked_carts").objectStore("parked_carts").getAll();
          req.onsuccess = () => {
            const row = req.result[0] as { lines: { quantity: number }[] } | undefined;
            open.result.close();
            resolve(row ? row.lines.reduce((s, l) => s + l.quantity, 0) : null);
          };
        };
      })
  );
  const stillAuthed = new URL(page.url()).pathname === "/pos";
  const pass = /2 item\(s\) totaling \S+/.test(cartText) && locked && parked === 2 && stillAuthed;
  record("TC-LOGOUT-03", "Cart parking", pass, `callout="${cartText.trim()}" pinLock=${locked} parkedQty=${parked} stillOnPos=${stillAuthed}`);
  await context.close();
}

async function tc04(browser: Browser) {
  // Store manager has no real open drawer; stub the drawer lookup the guard performs.
  const { context, page } = await login(browser, "Store Manager");
  await context.route("**/rest/v1/cash_drawer_sessions*", (route) => {
    const row = { id: "00000000-0000-0000-0000-000000000000", opening_float: 100, opened_at: new Date().toISOString() };
    const wantsObject = (route.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
    return route.fulfill({
      status: 200,
      contentType: wantsObject ? "application/vnd.pgrst.object+json" : "application/json",
      body: JSON.stringify(wantsObject ? row : [row]),
    });
  });
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  await openDialog(page);
  const text = (await page.getByTestId("logout-warning-drawer").textContent({ timeout: 4000 }).catch(() => "")) ?? "";
  const pass = /Cash drawer shift is still OPEN.*blind count.*Z-Report/.test(text);
  record("TC-LOGOUT-04", "Drawer shift notice", pass, pass ? "info callout shown for the (stubbed) open shift" : `callout text: "${text}"`);
  await context.close();
}

async function tc05(browser: Browser) {
  const { context, page: tab1 } = await login(browser, "Store Manager");
  await tab1.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  const tab2 = await context.newPage();
  await tab2.goto(`${BASE_URL}/dashboard/inventory`, { waitUntil: "networkidle" });
  // Broadcast the event itself (no sign-out) from a third page context member.
  const sender = await context.newPage();
  await sender.goto(`${BASE_URL}/login`, { waitUntil: "commit" }).catch(() => {});
  await sender.evaluate(() => {
    const ch = new BroadcastChannel("mall_auth_channel");
    ch.postMessage({ type: "FORCE_LOGOUT", timestamp: Date.now() });
    ch.close();
  });
  const redirected = await Promise.all(
    [tab1, tab2].map((t) => t.waitForURL((u) => u.pathname === "/login", { timeout: 8000 }).then(() => true).catch(() => false))
  );
  const pass = redirected.every(Boolean);
  record("TC-LOGOUT-05", "Multi-tab termination", pass, `tab1→/login=${redirected[0]} tab2→/login=${redirected[1]}`);
  await context.close();
}

async function tc06(browser: Browser) {
  // Every button variant at once: cart (Park), pending queue (Sync Now), drawer notice; desktop and phone.
  const dims: string[] = [];
  let pass = true;
  for (const [vp, minH] of [[{ width: 1280, height: 800 }, 44], [{ width: 390, height: 844 }, 48]] as const) {
    const { context, page } = await login(browser, "Cashier", { ...vp });
    await page.goto(`${BASE_URL}/pos`, { waitUntil: "networkidle" });
    const card = page.locator('[data-tour="pos-product-card"] button:not([disabled])').first();
    await card.click();
    await mockPendingQueue(context, page);
    await openDialog(page);
    const boxes = await page.getByTestId("logout-dialog").getByRole("button").evaluateAll((els) =>
      els.map((e) => ({ name: (e.textContent ?? "").trim() || e.getAttribute("aria-label") || "?", h: (e as HTMLElement).offsetHeight, role: e.getAttribute("role") }))
    );
    const actions = boxes.filter((b) => ["Stay Signed In", "Park Cart & Lock", "Discard & Sign Out", "Sync Now"].includes(b.name));
    const ok = actions.length === 4 && actions.every((b) => b.h >= minH - 0.5);
    pass &&= ok;
    dims.push(`${vp.width}px(min ${minH}): ${actions.map((b) => `${b.name}=${Math.round(b.h)}`).join(", ")}`);
    await context.close();
  }
  record("TC-LOGOUT-06", "Touch dimensions", pass, dims.join(" | "));
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
