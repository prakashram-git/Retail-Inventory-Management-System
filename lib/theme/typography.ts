import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { typographySettingsSchema, type TypographySettings } from "./typography-shared";

/**
 * Mall-wide typography, applied via CSS custom properties on <html> in
 * app/layout.tsx (see FONT_STACKS / FONT_SIZE_PERCENT in typography-shared.ts)
 * — so it reaches every form in the app (POS and dashboard) without touching
 * each one individually, and changes without a rebuild. Global-only (the
 * system_settings row with store_id IS NULL), super_admin-only: RLS's
 * `system_settings_write` policy already restricts writes to that row to
 * super_admin (store_manager/ui_designer only match rows where
 * store_id = their own store, which NULL never satisfies), so no extra
 * column-restriction trigger is needed the way terminal lock settings
 * required one.
 */
export * from "./typography-shared";

const FALLBACK: TypographySettings = {
  form_font_family: "geist",
  form_font_size: "medium",
};

export async function getTypographySettings(supabase: SupabaseClient): Promise<TypographySettings> {
  const { data } = await supabase
    .from("system_settings")
    .select("form_font_family, form_font_size")
    .is("store_id", null)
    .maybeSingle();

  if (!data) return FALLBACK;

  const parsed = typographySettingsSchema.safeParse(data);
  return parsed.success ? parsed.data : FALLBACK;
}
