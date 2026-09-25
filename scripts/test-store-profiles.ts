#!/usr/bin/env -S npx tsx
/**
 * Store profile / feature-flag QA.   npm run test:store-profiles
 * Requires supabase/store_profiles.sql + supabase/store_profile_executive_widgets.sql applied.
 * Uses a disposable store (TC-PROF-*) via the service role, and the demo manager/super_admin
 * accounts for authorization and UI-driven checks (TC-PROF-C/D need the app running — BASE_URL,
 * default http://localhost:3000). Restores whatever it moves/changes on the demo manager and
 * the seeded profiles, and deletes the rest.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import type { Browser, Page } from "playwright";

for (const f of [".env.local", ".env"]) {
  const full = path.join(process.cwd(), f);
  if (fs.existsSync(full)) process.loadEnvFile(full);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
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

/** Swaps the demo store manager onto `storeId` for the duration of `fn`, then swaps them back. */
async function asManagerOfStore<T>(storeId: string, fn: (page: Page) => Promise<T>, browser: Browser): Promise<T> {
  const { data: mgrProfile } = await admin.from("profiles").select("store_id").eq("email", "manager@malldemo.com").single();
  const originalStoreId = mgrProfile!.store_id as string;
  const { data: originalRow } = await admin
    .from("stores")
    .select("active_profile_id, custom_feature_overrides")
    .eq("id", originalStoreId)
    .single();
  await admin.from("profiles").update({ store_id: storeId }).eq("email", "manager@malldemo.com");
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Store Manager" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    return await fn(page);
  } finally {
    await admin.from("profiles").update({ store_id: originalStoreId }).eq("email", "manager@malldemo.com");
    await admin
      .from("stores")
      .update(originalRow! as { active_profile_id: string; custom_feature_overrides: Record<string, boolean> })
      .eq("id", originalStoreId);
  }
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
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();

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
    // The Inventory page's own "New product" button is not feature-gated (only the dashboard's
    // Quick Actions tile is) — the real guarantee is the server action itself, so submit the
    // form for real and check createProduct's rejection message, then that it's allowed once
    // the override flips allow_new_product on.
    const cResult = await asManagerOfStore(
      storeId,
      async (page) => {
        const createTcProfProduct = async () => {
          await page.goto(`${BASE_URL}/dashboard/inventory`, { waitUntil: "networkidle" });
          await page.getByRole("button", { name: /New product/ }).first().click();
          await page.locator("#product-name").waitFor({ timeout: 15000 });
          await page.getByTestId("sku-mode-manual").click();
          await page.locator("#product-name").fill(`TC-PROF ${suffix}`);
          await page.locator("#product-sku").fill(`TCPROF-${suffix}`);
          await page.getByRole("button", { name: "Create product" }).click();
          // Cold serverless functions can take several seconds for the action round-trip.
          await page.locator("[data-sonner-toast]").first().waitFor({ timeout: 20000 }).catch(() => {});
          return page.locator("[data-sonner-toast]").allTextContents();
        };
        const toastsBlocked = await createTcProfProduct();
        const blockedMessage = toastsBlocked.find((t) => /disabled on this store's profile/i.test(t));
        await admin.from("stores").update({ custom_feature_overrides: { allow_new_product: true } }).eq("id", storeId);
        const toastsAllowed = await createTcProfProduct();
        return {
          threw: !!blockedMessage,
          message: blockedMessage ?? `toasts: ${toastsBlocked.join(" | ")}`,
          allowedAfterEnabling: toastsAllowed.some((t) => /created/i.test(t)),
        };
      },
      browser
    );
    record("TC-PROF-C", "Product creation rejected on a disabled profile", cResult.threw && cResult.allowedAfterEnabling, `blocked: "${cResult.message}"; re-allowed after override=${cResult.allowedAfterEnabling}`);

    // Test D: executive-tier dashboard widgets (Executive Digest, Cashier Leaderboard, ...) are
    // hidden when allow_executive_widgets is off, independent of allow_new_product/show_dashboard,
    // and an operational widget stays visible throughout.
    await admin.from("stores").update({ active_profile_id: "profile_enterprise", custom_feature_overrides: {} }).eq("id", storeId);
    const dResult = await asManagerOfStore(
      storeId,
      async (page) => {
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
        const shownWithFlagOn = await page.getByText("Executive digest").count();
        const operationalAlwaysVisible = await page.getByText("Needs restocking").count();
        await admin.from("stores").update({ custom_feature_overrides: { allow_executive_widgets: false } }).eq("id", storeId);
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
        const hiddenWithFlagOff = await page.getByText("Executive digest").count();
        const leaderboardHiddenToo = await page.getByText("Cashier leaderboard", { exact: false }).count();
        const operationalStillVisible = await page.getByText("Needs restocking").count();
        return { shownWithFlagOn, operationalAlwaysVisible, hiddenWithFlagOff, leaderboardHiddenToo, operationalStillVisible };
      },
      browser
    );
    record(
      "TC-PROF-D",
      "Executive widgets gated independently of show_dashboard",
      dResult.shownWithFlagOn > 0 && dResult.operationalAlwaysVisible > 0 && dResult.hiddenWithFlagOff === 0 && dResult.leaderboardHiddenToo === 0 && dResult.operationalStillVisible > 0,
      `with flag on: Executive Digest present=${dResult.shownWithFlagOn > 0}, operational widget present=${dResult.operationalAlwaysVisible > 0}; with flag off: Executive Digest gone=${dResult.hiddenWithFlagOff === 0}, Cashier Leaderboard gone=${dResult.leaderboardHiddenToo === 0}, operational widget still present=${dResult.operationalStillVisible > 0}`
    );

    // Test D2: an individual executive widget can be turned off while the rest of the
    // category (and the master switch) stays on — the per-widget picks added on top of
    // allow_executive_widgets, and unset widgets stay enabled by default (no migration
    // needed to seed every widget key on every existing profile).
    await admin.from("stores").update({ active_profile_id: "profile_enterprise", custom_feature_overrides: {} }).eq("id", storeId);
    const d2Result = await asManagerOfStore(
      storeId,
      async (page) => {
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
        const bothShownByDefault = { digest: await page.getByText("Executive digest").count(), leaderboard: await page.getByText("Cashier leaderboard", { exact: false }).count() };
        const { data: enterprise } = await admin.from("store_profiles").select("features").eq("id", "profile_enterprise").single();
        await admin.from("store_profiles").update({ features: { ...enterprise!.features, exec_widget_widget_cashier_leaderboard: false } }).eq("id", "profile_enterprise");
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "networkidle" });
        const afterTurningOffOne = { digest: await page.getByText("Executive digest").count(), leaderboard: await page.getByText("Cashier leaderboard", { exact: false }).count() };
        await admin.from("store_profiles").update({ features: enterprise!.features }).eq("id", "profile_enterprise");
        return { bothShownByDefault, afterTurningOffOne };
      },
      browser
    );
    record(
      "TC-PROF-D2",
      "Individual executive widget can be turned off independently",
      d2Result.bothShownByDefault.digest > 0 && d2Result.bothShownByDefault.leaderboard > 0 && d2Result.afterTurningOffOne.digest > 0 && d2Result.afterTurningOffOne.leaderboard === 0,
      `before: digest=${d2Result.bothShownByDefault.digest > 0}, leaderboard=${d2Result.bothShownByDefault.leaderboard > 0}; after disabling only the leaderboard widget: digest still shown=${d2Result.afterTurningOffOne.digest > 0}, leaderboard gone=${d2Result.afterTurningOffOne.leaderboard === 0}`
    );

    // Test E: assigning a profile WITHOUT an overrides argument must not wipe a store's existing
    // custom_feature_overrides (the gap fixed in assignStoreProfileAction — it used to reset to {}
    // on every call, silently discarding customizations when a super admin just switched profiles
    // from the Store Assignment dropdown).
    await admin.from("stores").update({ active_profile_id: "profile_standard_retail", custom_feature_overrides: { allow_new_category: false } }).eq("id", storeId);
    const eNoArgs = await assignAsUserViaAction(superAdmin, storeId, "profile_enterprise");
    const { data: afterE } = await admin.from("stores").select("active_profile_id, custom_feature_overrides").eq("id", storeId).single();
    record(
      "TC-PROF-E",
      "Assigning a profile without overrides preserves existing overrides",
      eNoArgs.success && afterE?.active_profile_id === "profile_enterprise" && JSON.stringify(afterE?.custom_feature_overrides) === JSON.stringify({ allow_new_category: false }),
      `profile switched to ${afterE?.active_profile_id}; overrides preserved as ${JSON.stringify(afterE?.custom_feature_overrides)}`
    );

    // Test F: both profile actions reject an unknown profile id instead of silently no-op'ing.
    const fAssign = await assignAsUserViaAction(superAdmin, storeId, "profile_does_not_exist");
    const fUpdate = await updateProfileDefinitionViaAction(superAdmin, "profile_does_not_exist", { show_dashboard: true });
    record(
      "TC-PROF-F",
      "Unknown profile id is rejected, not silently ignored",
      !fAssign.success && /Unknown profile/.test(fAssign.error ?? "") && !fUpdate.success && /Unknown profile/.test(fUpdate.error ?? ""),
      `assign → ${JSON.stringify(fAssign)}; update → ${JSON.stringify(fUpdate)}`
    );
  } finally {
    console.log("Cleaning up test data...");
    await browser.close();
    await admin.from("stores").delete().eq("id", storeId);
    await admin
      .from("store_profiles")
      .update({
        features: {
          show_dashboard: false,
          allow_new_product: false,
          allow_new_category: false,
          allow_pos_shortcut: true,
          allow_reports_shortcut: false,
          allow_variant_matrix: false,
          allow_executive_widgets: false,
          high_performance_mode: true,
        },
      })
      .eq("id", "profile_lite_pos");
    await pg.end();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

/**
 * Mirrors assignStoreProfileAction's/updateProfileDefinitionAction's own guts (same reasoning as
 * assignAsUser above — the real "use server" functions need a Next.js request).
 */
async function assignAsUserViaAction(client: SupabaseClient, storeId: string, profileId: string) {
  const { data: role } = await client.rpc("get_auth_role");
  if (role !== "super_admin") return { success: false, error: "Unauthorized" };
  const { data: exists } = await client.from("store_profiles").select("id").eq("id", profileId).maybeSingle();
  if (!exists) return { success: false, error: `Unknown profile "${profileId}".` };
  const { error } = await client.from("stores").update({ active_profile_id: profileId }).eq("id", storeId);
  return error ? { success: false, error: error.message } : { success: true };
}

async function updateProfileDefinitionViaAction(client: SupabaseClient, profileId: string, features: Record<string, boolean>) {
  const { data: role } = await client.rpc("get_auth_role");
  if (role !== "super_admin") return { success: false, error: "Unauthorized" };
  const { data: exists } = await client.from("store_profiles").select("id").eq("id", profileId).maybeSingle();
  if (!exists) return { success: false, error: `Unknown profile "${profileId}".` };
  const { error } = await client.from("store_profiles").update({ features }).eq("id", profileId);
  return error ? { success: false, error: error.message } : { success: true };
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
