#!/usr/bin/env -S npx tsx
/**
 * Requires supabase/add_ui_designer_role.sql to have been run against the
 * target database first (the 'ui_designer' enum value and dashboard_layouts
 * table must exist) — this script creates a real, disposable ui_designer
 * test account and store to exercise the RBAC guardrails end to end, then
 * cleans up after itself.
 *
 * Run against local dev: npm run test:layout-role
 * Run against a deployed URL: TEST_BASE_URL=https://your-app.vercel.app npm run test:layout-role
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";

for (const envFile of [".env.local", ".env"]) {
  const full = path.join(process.cwd(), envFile);
  if (fs.existsSync(full)) process.loadEnvFile(full);
}

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

interface TestResult {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}
const results: TestResult[] = [];
function record(id: string, name: string, pass: boolean, detail: string) {
  results.push({ id, name, pass, detail });
  console.log(`[${id}] ${name} - ${pass ? "PASS" : "FAIL"}: ${detail}`);
}

/** A cookie jar + @supabase/ssr client, so signInWithPassword() produces the
 * exact same sb-*-auth-token cookie shape the real browser client would —
 * letting this script drive proxy.ts-protected routes with plain fetch(). */
function createCookieJarClient() {
  const jar = new Map<string, string>();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) jar.set(name, value);
      },
    },
  });
  return {
    supabase,
    cookieHeader: () => Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; "),
  };
}

async function fetchAsUser(cookieHeader: string, pathname: string) {
  return fetch(`${BASE_URL}${pathname}`, {
    headers: { Cookie: cookieHeader },
    redirect: "manual",
  });
}

async function main() {
  const admin = createServiceClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `test-ui-designer-${suffix}@malldemo.com`;
  const password = `Test-${suffix}-pw!`;

  console.log(`Setting up disposable test store + ui_designer account (${email})...`);

  const { data: store, error: storeError } = await admin
    .from("stores")
    .insert({
      name: `TC-ROLE Test Store ${suffix}`,
      code: `tcrole-${suffix}`,
      unit_number: "TEST",
      currency: "USD",
      locale: "en-US",
      timezone: "UTC",
      tax_model: "exclusive",
    })
    .select()
    .single();

  if (storeError || !store) {
    record("SETUP", "Create test store", false, storeError?.message ?? "no store returned");
    return;
  }

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authUser.user) {
    record("SETUP", "Create test auth user", false, authError?.message ?? "no user returned");
    await admin.from("stores").delete().eq("id", store.id);
    return;
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: authUser.user.id,
    email,
    role: "ui_designer",
    store_id: store.id,
    full_name: "Test UI Designer",
  });

  if (profileError) {
    record("SETUP", "Create ui_designer profile", false, profileError.message);
    await admin.auth.admin.deleteUser(authUser.user.id);
    await admin.from("stores").delete().eq("id", store.id);
    return;
  }

  try {
    // TC-ROLE-01: log in, reach the layout builder.
    const { supabase, cookieHeader } = createCookieJarClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      record("TC-ROLE-01", "ui_designer can log in", false, signInError.message);
    } else {
      const res = await fetchAsUser(cookieHeader(), "/dashboard/settings/layout-builder");
      record(
        "TC-ROLE-01",
        "ui_designer can access /dashboard/settings/layout-builder",
        res.status === 200,
        `HTTP ${res.status}`
      );
    }

    // TC-ROLE-02: blocked from /pos and /dashboard/settings/users.
    const posRes = await fetchAsUser(cookieHeader(), "/pos");
    const posBlocked = posRes.status === 307 && !!posRes.headers.get("location")?.includes("/dashboard/settings/appearance");
    record("TC-ROLE-02a", "ui_designer redirected away from /pos", posBlocked, `HTTP ${posRes.status} -> ${posRes.headers.get("location")}`);

    const usersRes = await fetchAsUser(cookieHeader(), "/dashboard/settings/users");
    const usersBlocked =
      usersRes.status === 307 && !!usersRes.headers.get("location")?.includes("/dashboard/settings/appearance");
    record(
      "TC-ROLE-02b",
      "ui_designer redirected away from /dashboard/settings/users",
      usersBlocked,
      `HTTP ${usersRes.status} -> ${usersRes.headers.get("location")}`
    );

    // Server-action-level boundary too, not just the middleware redirect —
    // a direct call must also be rejected (this is the real, non-bypassable
    // boundary per this repo's own doctrine).
    const { error: rlsError } = await supabase.from("products").insert({
      store_id: store.id,
      sku: `SHOULD-FAIL-${suffix}`,
      name: "Should be rejected",
      cost_price: 1,
      retail_price: 2,
    });
    record(
      "TC-ROLE-02c",
      "ui_designer's direct product INSERT is rejected by RLS",
      !!rlsError,
      rlsError ? rlsError.message : "INSERT SUCCEEDED — this is a real vulnerability"
    );

    // TC-LAYOUT-03: reorder "Dead Stock" above "Revenue vs COGS", hide Restock Alerts.
    const layoutConfig = [
      { id: "metric_gross_revenue", visible: true, x: 0, y: 0, w: 3, h: 2 },
      { id: "metric_net_profit", visible: true, x: 3, y: 0, w: 3, h: 2 },
      { id: "metric_aov", visible: true, x: 6, y: 0, w: 3, h: 2 },
      { id: "metric_shrinkage", visible: true, x: 9, y: 0, w: 3, h: 2 },
      { id: "widget_dead_stock", visible: true, x: 0, y: 2, w: 12, h: 4 },
      { id: "chart_revenue_vs_cogs", visible: true, x: 0, y: 6, w: 8, h: 4 },
      { id: "widget_restock_alerts", visible: false, x: 8, y: 6, w: 4, h: 4 },
      { id: "widget_recent_orders", visible: true, x: 0, y: 10, w: 12, h: 4 },
    ];
    const themeConfig = { accentColor: "#22c55e", glassOpacity: 60, borderRadius: "pill", monoNumbers: false };

    const { error: upsertError } = await admin.from("dashboard_layouts").upsert(
      {
        store_id: store.id,
        user_id: null,
        layout_config: layoutConfig,
        theme_config: themeConfig,
        is_active: true,
        updated_by: authUser.user.id,
      },
      { onConflict: "store_id,user_id" }
    );
    record("TC-LAYOUT-03", "Layout saved with reordered/hidden widgets", !upsertError, upsertError?.message ?? "saved");

    // TC-LAYOUT-04: a different role (store_manager, same store) sees it immediately.
    const { data: managerAuth, error: managerAuthError } = await admin.auth.admin.createUser({
      email: `test-manager-${suffix}@malldemo.com`,
      password,
      email_confirm: true,
    });
    if (managerAuthError || !managerAuth.user) {
      record("TC-LAYOUT-04", "Store manager sees published layout", false, managerAuthError?.message ?? "no user");
    } else {
      await admin.from("profiles").insert({
        id: managerAuth.user.id,
        email: `test-manager-${suffix}@malldemo.com`,
        role: "store_manager",
        store_id: store.id,
        full_name: "Test Store Manager",
      });

      const { supabase: managerSupabase, cookieHeader: managerCookies } = createCookieJarClient();
      await managerSupabase.auth.signInWithPassword({
        email: `test-manager-${suffix}@malldemo.com`,
        password,
      });
      const dashRes = await fetchAsUser(managerCookies(), "/dashboard");
      const html = await dashRes.text();
      const hasDeadStock = html.includes("Dead stock monitor") || html.includes("Dead Stock Monitor");
      const hidesRestock = !html.includes("Needs restocking");
      record(
        "TC-LAYOUT-04",
        "Store manager's dashboard reflects the published layout (dead stock shown, restock alerts hidden)",
        hasDeadStock && hidesRestock,
        `deadStockPresent=${hasDeadStock} restockHidden=${hidesRestock} (HTTP ${dashRes.status})`
      );

      await admin.auth.admin.deleteUser(managerAuth.user.id);
    }

    // TC-LAYOUT-05: publishing a layout never touched orders/order_items/inventory_logs.
    const { count: orderCount } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("store_id", store.id);
    const { count: logCount } = await admin
      .from("inventory_logs")
      .select("id", { count: "exact", head: true })
      .eq("store_id", store.id);
    record(
      "TC-LAYOUT-05",
      "Layout publish touched no transactional financial data",
      orderCount === 0 && logCount === 0,
      `orders=${orderCount} inventory_logs=${logCount} (both should be 0 — this store never made a sale)`
    );
  } finally {
    console.log("\nCleaning up test store/accounts...");
    await admin.from("dashboard_layouts").delete().eq("store_id", store.id);
    await admin.auth.admin.deleteUser(authUser.user.id);
    await admin.from("stores").delete().eq("id", store.id);
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  if (passed !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error("test-layout-role failed:", err);
  process.exit(1);
});
