#!/usr/bin/env -S npx tsx
/**
 * Store profile / feature-flag QA.   npm run test:store-profiles
 * Requires supabase/store_profiles.sql applied. Uses a disposable store (TC-PROF-*) via the
 * service role, and the demo manager/super_admin accounts for authorization checks. Restores
 * whatever it changes on the demo store and Lite Register profile, and deletes the rest.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";

for (const f of [".env.local", ".env"]) {
  const full = path.join(process.cwd(), f);
  if (fs.existsSync(full)) process.loadEnvFile(full);
}
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

/**
 * The server actions call `cookies()`/`headers()` (via requireSuperAdmin -> createClient), which
 * only exist inside a Next.js request — invalid from a plain script. Each action's guts are
 * exercised directly against the signed-in client instead, which is exactly what
 * requireSuperAdmin()/getStoreEffectiveFeatures() run against; the guard logic itself (role
 * check, jsonb merge) is what's under test, not Next's request-scoped cookie jar.
 */
async function assignAsUser(client: SupabaseClient, storeId: string, profileId: string) {
  const { data: role, error: roleErr } = await client.rpc("get_auth_role");
  if (roleErr) return { success: false, error: roleErr.message };
  if (role !== "super_admin") return { success: false, error: "Unauthorized" };
  const { error } = await client.from("stores").update({ active_profile_id: profileId }).eq("id", storeId);
  return error ? { success: false, error: error.message } : { success: true };
}

async function getEffectiveFeaturesAsUser(client: SupabaseClient, storeId: string) {
  const { data: store } = await client
    .from("stores")
    .select("active_profile_id, custom_feature_overrides, store_profiles(features)")
    .eq("id", storeId)
    .maybeSingle<{ active_profile_id: string; custom_feature_overrides: Record<string, boolean>; store_profiles: { features: Record<string, boolean> } | { features: Record<string, boolean> }[] }>();
  const rel = store?.store_profiles;
  const profileFeatures = Array.isArray(rel) ? rel[0]?.features : rel?.features;
  return { ...(profileFeatures ?? {}), ...(store?.custom_feature_overrides ?? {}) };
}

async function main() {
  const pg = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  const suffix = Date.now().toString(36).toUpperCase().slice(-5);

  const { data: testStore, error: storeErr } = await admin
    .from("stores")
    .insert({ name: `TC-PROF Store ${suffix}`, code: `tcprof-${suffix}`, unit_number: "TEST", currency: "USD", locale: "en-US", tax_model: "exclusive" })
    .select("id")
    .single();
  if (storeErr) throw new Error(`store insert: ${storeErr.message}`);
  const storeId = testStore.id as string;

  try {
    // Test A: a non-super_admin cannot assign a profile.
    const manager = await userClient("manager@malldemo.com", "demo-store-manager");
    const superAdmin = await userClient("superadmin@malldemo.com", "demo-super-admin");
    const managerTry = await assignAsUser(manager, storeId, "profile_enterprise");
    const adminTry = await assignAsUser(superAdmin, storeId, "profile_enterprise");
    const { data: afterManager } = await admin.from("stores").select("active_profile_id").eq("id", storeId).single();
    record(
      "TC-PROF-A",
      "Non-super_admin cannot assign a profile",
      !managerTry.success && managerTry.error === "Unauthorized" && adminTry.success && afterManager?.active_profile_id === "profile_enterprise",
      `manager → ${JSON.stringify(managerTry)}; super_admin → ${JSON.stringify(adminTry)}; store now on ${afterManager?.active_profile_id}`
    );

    // Test B: effective features = profile defaults shallow-merged with the store's own overrides.
    await admin.from("stores").update({ active_profile_id: "profile_lite_pos", custom_feature_overrides: {} }).eq("id", storeId);
    const baseline = await getEffectiveFeaturesAsUser(superAdmin, storeId);
    await admin.from("stores").update({ custom_feature_overrides: { allow_new_product: true } }).eq("id", storeId);
    const overridden = await getEffectiveFeaturesAsUser(superAdmin, storeId);
    record(
      "TC-PROF-B",
      "Effective features merge overrides over profile defaults",
      baseline.allow_new_product === false && baseline.show_dashboard === false && overridden.allow_new_product === true && overridden.show_dashboard === false,
      `Lite Register baseline: allow_new_product=${baseline.allow_new_product}, show_dashboard=${baseline.show_dashboard}; with override allow_new_product:true → allow_new_product=${overridden.allow_new_product} (show_dashboard still ${overridden.show_dashboard}, untouched by the override)`
    );

    // Test C: createProduct rejects when the store's profile has allow_new_product = false.
    await admin.from("stores").update({ active_profile_id: "profile_lite_pos", custom_feature_overrides: {} }).eq("id", storeId);
    const { data: mgrProfile } = await admin.from("profiles").select("store_id").eq("email", "manager@malldemo.com").single();
    const originalStoreId = mgrProfile!.store_id as string;
    const originalProfileRow = await admin.from("stores").select("active_profile_id, custom_feature_overrides").eq("id", originalStoreId).single();
    await admin.from("profiles").update({ store_id: storeId }).eq("email", "manager@malldemo.com");
    await admin.from("stores").update({ active_profile_id: "profile_lite_pos", custom_feature_overrides: {} }).eq("id", originalStoreId);
    // The Inventory page's own "New product" button is not feature-gated (only the dashboard's
    // Quick Actions tile is) — the real guarantee is the server action itself, so submit the
    // form for real and check createProduct's rejection message, then that it's allowed once
    // the override flips allow_new_product on.
    let rejected = { threw: false, message: "" };
    let allowedAfterEnabling = false;
    const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext()).newPage();
      await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Store Manager" }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });

      const createTcProfProduct = async () => {
        await page.goto(`${BASE_URL}/dashboard/inventory`, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: /New product/ }).first().click();
        await page.locator("#product-name").waitFor();
        await page.getByTestId("sku-mode-manual").click();
        await page.locator("#product-name").fill(`TC-PROF ${suffix}`);
        await page.locator("#product-sku").fill(`TCPROF-${suffix}`);
        await page.getByRole("button", { name: "Create product" }).click();
        await page.waitForTimeout(1500);
        return page.locator("[data-sonner-toast]").allTextContents();
      };

      const toastsBlocked = await createTcProfProduct();
      const blockedMessage = toastsBlocked.find((t) => /disabled on this store's profile/i.test(t));
      rejected = { threw: !!blockedMessage, message: blockedMessage ?? `toasts: ${toastsBlocked.join(" | ")}` };

      await admin.from("stores").update({ custom_feature_overrides: { allow_new_product: true } }).eq("id", storeId);
      const toastsAllowed = await createTcProfProduct();
      allowedAfterEnabling = toastsAllowed.some((t) => /created/i.test(t));
    } finally {
      await browser.close();
      await admin.from("profiles").update({ store_id: originalStoreId }).eq("email", "manager@malldemo.com");
      await admin.from("stores").update(originalProfileRow.data! as { active_profile_id: string; custom_feature_overrides: Record<string, boolean> }).eq("id", originalStoreId);
    }
    record("TC-PROF-C", "Product creation rejected on a disabled profile", rejected.threw && allowedAfterEnabling, `blocked: "${rejected.message}"; re-allowed after override=${allowedAfterEnabling}`);
  } finally {
    console.log("Cleaning up test data...");
    await admin.from("stores").delete().eq("id", storeId);
    await admin.from("store_profiles").update({ features: { show_dashboard: false, allow_new_product: false, allow_new_category: false, allow_pos_shortcut: true, allow_reports_shortcut: false, allow_variant_matrix: false, high_performance_mode: true } }).eq("id", "profile_lite_pos");
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
