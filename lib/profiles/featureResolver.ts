import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { StoreFeatures } from "./types";

const FALLBACK = {
  show_dashboard: true,
  allow_new_product: true,
  allow_new_category: true,
  allow_pos_shortcut: true,
  allow_reports_shortcut: true,
  allow_variant_matrix: true,
  allow_executive_widgets: true,
  high_performance_mode: false,
} satisfies Omit<StoreFeatures, "meta" | "raw">;

function withMeta(features: Record<string, boolean>): StoreFeatures {
  const merged = { ...FALLBACK, ...features };
  const lite = merged.high_performance_mode;
  return { ...merged, meta: { disableMotion: lite, disableBlur: lite }, raw: features };
}

/**
 * `stores.active_profile_id` -> `store_profiles.features`, shallow-merged with
 * `stores.custom_feature_overrides` (the store's own overrides win). If the store, its
 * profile, or the whole feature system is missing, every feature defaults to enabled — a
 * missing row should never lock a store out of its own tools.
 */
export async function getStoreEffectiveFeatures(storeId: string): Promise<StoreFeatures> {
  const supabase = await createClient();
  const { data: store, error } = await supabase
    .from("stores")
    .select("active_profile_id, custom_feature_overrides, store_profiles(features)")
    .eq("id", storeId)
    .maybeSingle<{
      active_profile_id: string | null;
      custom_feature_overrides: Record<string, boolean> | null;
      store_profiles: { features: Record<string, boolean> } | { features: Record<string, boolean> }[] | null;
    }>();

  if (error || !store) return withMeta(FALLBACK);

  const profileRel = store.store_profiles;
  const profileFeatures = Array.isArray(profileRel) ? profileRel[0]?.features : profileRel?.features;

  const merged: Record<string, boolean> = {
    ...FALLBACK,
    ...(profileFeatures ?? {}),
    ...(store.custom_feature_overrides ?? {}),
  };

  return withMeta(merged);
}
