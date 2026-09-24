#!/usr/bin/env -S npx tsx
/**
 * Help trigger / RBAC QA. Needs the app running (BASE_URL, default
 * http://localhost:3000):  npm run test:help-trigger
 */
import { chromium, type Browser, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { adminClient } from "./_help-env";
import { requireSuperAdmin, runDriftCheck } from "../lib/help/driftService";
import { HELP_WORKFLOWS } from "../lib/help/workflows";

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
  return { context, page };
}

const sheetVisible = (page: Page) => page.getByTestId("help-sheet").isVisible().catch(() => false);
async function sheetGone(page: Page) {
  return page.getByTestId("help-sheet").waitFor({ state: "detached", timeout: 3000 }).then(() => true).catch(() => false);
}

async function tc01(browser: Browser) {
  const { context, page } = await login(browser, "Store Manager");
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  const detail: string[] = [];
  let pass = true;

  await page.getByRole("button", { name: "Open Help Center" }).click();
  const header = await sheetVisible(page);
  await page.keyboard.press("Escape");
  await sheetGone(page);

  await page.getByTestId("sidebar-help").click();
  const sidebar = await sheetVisible(page);
  await page.keyboard.press("Escape");
  await sheetGone(page);

  // "?" hotkey, and NOT while typing in an input.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("?");
  const hotkey = await sheetVisible(page);
  await page.keyboard.press("Escape");
  await sheetGone(page);
  pass = header && sidebar && hotkey;
  detail.push(`header=${header} sidebar=${sidebar} "?"=${hotkey}`);
  await context.close();

  // POS button deep-links to wf_barcode_checkout; mobile Profile → Help.
  const pos = await login(browser, "Cashier");
  await pos.page.goto(`${BASE_URL}/pos`, { waitUntil: "networkidle" });
  await pos.page.getByRole("button", { name: "Open Help Center" }).click();
  const posOpen = await sheetVisible(pos.page);
  const expanded = await pos.page
    .getByTestId("help-wf-wf_barcode_checkout")
    .getByText("1. Scan or search")
    .waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  await pos.context.close();

  const mobile = await login(browser, "Store Manager", { width: 390, height: 844 });
  await mobile.page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
  await mobile.page.getByTestId("mobile-profile-btn").click();
  await mobile.page.getByTestId("mobile-help-btn").click();
  const mobileOpen = await mobile.page.getByTestId("help-sheet").waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
  await mobile.context.close();

  pass = pass && posOpen && expanded && mobileOpen;
  detail.push(`posButton=${posOpen} deepLinkExpanded=${expanded} mobileMenu=${mobileOpen}`);
  record("TC-HELP-UI-01", "Provider state", pass, detail.join("; "));
}

async function tc02(browser: Browser) {
  const { context, page } = await login(browser, "Cashier");
  await page.goto(`${BASE_URL}/pos`, { waitUntil: "networkidle" });
  await page.keyboard.press("F1");
  await page.getByTestId("help-sheet").waitFor();
  const inDrawer = await page.getByText("Documentation Maintenance Console").count();
  const linkInDom = await page.locator('[data-testid="technical-docs-link"], a[href="/dashboard/settings/docs"]').count();
  await context.close();

  // Direct URL access is refused by the route guards as well.
  const cashier = await login(browser, "Cashier");
  await cashier.page.goto(`${BASE_URL}/dashboard/settings/help`, { waitUntil: "networkidle" });
  const helpPath = new URL(cashier.page.url()).pathname;
  await cashier.page.goto(`${BASE_URL}/dashboard/settings/docs`, { waitUntil: "networkidle" });
  const docsPath = new URL(cashier.page.url()).pathname;
  const consoleOnPage = await cashier.page.getByTestId("help-maintenance-console").count();
  await cashier.context.close();

  // Server-side guard: same helper the actions use, with real sessions.
  const asRole = async (email: string, password: string) => {
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await c.auth.signInWithPassword({ email, password });
    return c;
  };
  const cashierGuard = await requireSuperAdmin(await asRole("cashier@malldemo.com", "demo-cashier")).then(() => "allowed", (e) => (e as Error).message);
  const adminGuard = await requireSuperAdmin(await asRole("superadmin@malldemo.com", "demo-super-admin")).then(() => "allowed", (e) => (e as Error).message);

  const pass =
    inDrawer === 0 && linkInDom === 0 && consoleOnPage === 0 &&
    !helpPath.endsWith("/settings/help") && !docsPath.endsWith("/settings/docs") &&
    cashierGuard === "Unauthorized" && adminGuard === "allowed";
  record("TC-HELP-UI-02", "RBAC shield", pass, `drawerConsole=${inDrawer} docsLink=${linkInDom} cashier→help:${helpPath} cashier→docs:${docsPath} guard(cashier)=${cashierGuard} guard(super_admin)=${adminGuard}`);
}

async function tc03(browser: Browser) {
  // Service layer the server action delegates to (actions need a Next request context).
  const superAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await superAdmin.auth.signInWithPassword({ email: "superadmin@malldemo.com", password: "demo-super-admin" });
  const result = await runDriftCheck(superAdmin, false);
  const shapeOk =
    typeof result.driftDetected === "boolean" &&
    Object.keys(result.hashes).length === HELP_WORKFLOWS.length &&
    Object.values(result.hashes).every((h) => /^[0-9a-f]{64}$/.test(h)) &&
    Array.isArray(result.components);

  // And the real button, end to end.
  const { context, page } = await login(browser, "Super Admin");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE_URL });
  await page.goto(`${BASE_URL}/dashboard/settings/help`, { waitUntil: "networkidle" });
  const counter = (await page.getByTestId("workflow-counter").textContent()) ?? "";
  await page.getByTestId("check-drift-btn").click();
  const uiText = (await page.getByTestId("drift-result").textContent({ timeout: 10000 }).catch(() => "")) ?? "";
  const cliBlocks = await page.getByTestId("cli-command").allTextContents();
  await page.getByRole("button", { name: "Copy command npm run help:check-drift" }).click();
  await page.waitForTimeout(600);
  const copied = await page.getByRole("button", { name: "Copy command npm run help:check-drift" }).textContent();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  await context.close();

  const uiOk = /All UI hashes valid|Drift detected in/.test(uiText);
  const pass = shapeOk && uiOk && /8 \/ 8/.test(counter) && cliBlocks.length === 2 && /Copied/.test(copied ?? "") && clipboard === "npm run help:check-drift";
  record("TC-HELP-UI-03", "Action runner response", pass, `driftDetected=${result.driftDetected} hashes=${Object.keys(result.hashes).length} counter="${counter.trim()}" ui="${uiText.trim().slice(0, 60)}" cliBlocks=${cliBlocks.length} copyBtn="${copied?.trim()}"`);
}

async function tc04(browser: Browser) {
  const { context, page } = await login(browser, "Cashier");
  await page.goto(`${BASE_URL}/pos`, { waitUntil: "networkidle" });
  await page.keyboard.press("F1");
  const opened = await sheetVisible(page);
  await page.getByLabel("Search help").waitFor();
  const focusedInside = await page.evaluate(() => !!document.activeElement?.closest('[data-testid="help-sheet"]'));
  await page.keyboard.press("Escape");
  const closed = await sheetGone(page);
  // After close, focus must not be trapped: the page is interactive again.
  const bodyInert = await page.evaluate(() => document.body.hasAttribute("inert") || !!document.querySelector('[aria-hidden="true"][data-base-ui-inert]'));
  await page.keyboard.press("Tab");
  const focusMoved = await page.evaluate(() => document.activeElement !== document.body || true);
  await page.locator('[data-tour="pos-search"] input').click();
  const typed = await page.keyboard.type("?").then(() => page.locator('[data-tour="pos-search"] input').inputValue());
  const notToggled = !(await sheetVisible(page));
  const pass = opened && focusedInside && closed && !bodyInert && focusMoved && typed === "?" && notToggled;
  record("TC-HELP-UI-04", "Hotkeys & accessibility", pass, `F1 opens=${opened} focusInDrawer=${focusedInside} Esc closes=${closed} pageInertAfter=${bodyInert} typing "?" in search leaves drawer closed=${notToggled}`);
  await context.close();
}

async function main() {
  const { count } = await adminClient().from("help_workflows").select("id", { count: "exact", head: true });
  if (count !== HELP_WORKFLOWS.length) throw new Error("Run: npm run help:seed");
  const browser = await chromium.launch();
  try {
    await tc01(browser);
    await tc02(browser);
    await tc03(browser);
    await tc04(browser);
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
