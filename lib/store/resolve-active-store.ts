import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A super_admin has no store_id of their own, so without an active-store
 * cookie the caller must fall back to the mall's first store — never to
 * `null`. `.order("name")` makes that fallback deterministic, so every page
 * that calls this independently (Server Components can't persist a cookie
 * for later reads) still lands on the same store instead of silently
 * diverging. Returns `null` only when the mall genuinely has zero stores.
 */
export async function resolveActiveStoreId(
  supabase: SupabaseClient,
  cookieStoreId: string | undefined,
  profile: { role: string; store_id: string | null }
): Promise<string | null> {
  if (profile.role !== "super_admin") {
    return profile.store_id;
  }
  if (cookieStoreId) {
    return cookieStoreId;
  }
  const { data } = await supabase
    .from("stores")
    .select("id")
    .order("name")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
