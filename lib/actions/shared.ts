import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import type { UserRole } from "@/lib/types/domain";

/**
 * Resolves the store a mutation should apply to the same way Shell.tsx
 * resolves it for reads: super_admin follows the active-store cookie,
 * everyone else is pinned to their profile's store_id regardless of what
 * the client sends, since the cookie is not itself a trust boundary.
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

  let storeId = profile.store_id as string | null;
  if (role === "super_admin") {
    const cookieStore = await cookies();
    storeId = cookieStore.get(ACTIVE_STORE_COOKIE)?.value ?? storeId;
  }

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
