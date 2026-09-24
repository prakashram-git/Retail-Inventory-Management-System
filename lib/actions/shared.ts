import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { resolveActiveStoreId } from "@/lib/store/resolve-active-store";
import type { UserRole } from "@/lib/types/domain";

/**
 * Resolves the store a mutation should apply to the same way Shell.tsx
 * resolves it for reads: super_admin follows the active-store cookie,
 * everyone else is pinned to their profile's store_id regardless of what
 * the client sends, since the cookie is not itself a trust boundary.
 *
 * Every caller of this (products, categories, stock adjustments) is a
 * management action cashiers should never reach — the UI already hides
 * these controls from them, but that's not a security boundary on its own
 * (a direct POST to the server action, or a direct Supabase call with the
 * publishable key, both bypass it). This throws before that matters. The
 * database's own RLS write policies (role_scoped_write_policies.sql) are
 * the real, non-bypassable boundary; this check exists so a cashier who
 * somehow reaches here gets a clean error instead of a raw Postgres 42501.
 *
 * ui_designer is blocked here too — it's scoped to appearance/layout only
 * (see requireLayoutEditor below) and has no RLS write access to products,
 * categories, or inventory_logs (role_scoped_write_policies.sql only grants
 * those to super_admin/store_manager), so it would hit the same 42501 a
 * cashier would.
 */
export async function requireStoreContext() {
  const supabase = await createClient();

  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) {
    throw new Error("Not authenticated");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, store_id")
    .eq("id", userResult.user.id)
    .single();

  if (error || !profile) {
    throw new Error("Unable to resolve profile");
  }

  const role = profile.role as UserRole;

  if (role === "cashier" || role === "ui_designer") {
    throw new Error("403 Forbidden: Insufficient permissions to perform this action.");
  }

  const cookieStore = await cookies();
  const storeId = await resolveActiveStoreId(
    supabase,
    cookieStore.get(ACTIVE_STORE_COOKIE)?.value,
    { role, store_id: profile.store_id as string | null }
  );

  if (!storeId) {
    throw new Error("No active store");
  }

  return { supabase, storeId, role };
}

/**
 * Store/appearance/staff administration is mall-wide, not store-scoped, so
 * these actions check the role directly instead of relying on
 * requireStoreContext()'s store resolution.
 */
export async function requireSuperAdmin() {
  const supabase = await createClient();

  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) {
    throw new Error("Not authenticated");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userResult.user.id)
    .single();

  if (error || !profile) {
    throw new Error("Unable to resolve profile");
  }

  if ((profile.role as UserRole) !== "super_admin") {
    throw new Error("Only super admins can perform this action.");
  }

  return { supabase };
}

/**
 * Dashboard-layout/theme customization is limited to super_admin and
 * ui_designer. Unlike requireStoreContext(), ui_designer is store-pinned
 * (never mall-wide) even when the caller is resolving which store's layout
 * to edit — a store-scoped designer publishing a layout must always target
 * their own store_id, never whatever the active-store cookie happens to say
 * (that cookie is super_admin-only UI state, not a trust boundary for them).
 */
export async function requireLayoutEditor() {
  const supabase = await createClient();

  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) {
    throw new Error("Not authenticated");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, store_id")
    .eq("id", userResult.user.id)
    .single();

  if (error || !profile) {
    throw new Error("Unable to resolve profile");
  }

  const role = profile.role as UserRole;
  if (role !== "super_admin" && role !== "ui_designer") {
    throw new Error("Only super admins and UI designers can customize the dashboard layout.");
  }

  let storeId: string | null;
  if (role === "super_admin") {
    const cookieStore = await cookies();
    storeId = await resolveActiveStoreId(
      supabase,
      cookieStore.get(ACTIVE_STORE_COOKIE)?.value,
      { role, store_id: profile.store_id as string | null }
    );
  } else {
    storeId = profile.store_id as string | null;
    if (!storeId) throw new Error("No store is assigned to this account.");
  }

  return { supabase, role, storeId };
}
