import { createClient } from "@/lib/supabase/server";
import type { AppearanceSettings } from "@/lib/types/domain";

const ARCHITECTURAL_FALLBACK: AppearanceSettings = {
  home_background_url:
    "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=2400&auto=format&fit=crop",
  blur_strength: 24,
  overlay_opacity: 0.45,
};

/**
 * Resolves the login background in three steps: a wallpaper scoped to the
 * given store, then the mall-wide default (`store_id IS NULL`), then a
 * hardcoded architectural preset if `system_settings` has neither row yet.
 */
export async function resolveLoginAppearance(
  storeId: string | null
): Promise<AppearanceSettings> {
  const supabase = await createClient();

  if (storeId) {
    const { data: storeSettings } = await supabase
      .from("system_settings")
      .select("home_background_url, blur_strength, overlay_opacity")
      .eq("store_id", storeId)
      .maybeSingle();

    if (storeSettings?.home_background_url) {
      return storeSettings as AppearanceSettings;
    }
  }

  const { data: globalSettings } = await supabase
    .from("system_settings")
    .select("home_background_url, blur_strength, overlay_opacity")
    .is("store_id", null)
    .maybeSingle();

  if (globalSettings?.home_background_url) {
    return globalSettings as AppearanceSettings;
  }

  return ARCHITECTURAL_FALLBACK;
}
