import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_LAYOUT_CONFIG,
  DEFAULT_THEME_CONFIG,
  type DashboardWidgetConfig,
  type DashboardThemeConfig,
} from "./layout-types";

const widgetConfigSchema = z.object({
  id: z.string().min(1),
  visible: z.boolean(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1),
});

const themeConfigSchema = z.object({
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  glassOpacity: z.number().min(10).max(90),
  borderRadius: z.enum(["sharp", "rounded", "pill"]),
  monoNumbers: z.boolean(),
});

export interface ResolvedDashboardLayout {
  layoutConfig: DashboardWidgetConfig[];
  themeConfig: DashboardThemeConfig;
  isCustom: boolean;
}

/**
 * Resolves the effective dashboard layout for a store: its own row, else the
 * mall-wide global row, else the hardcoded default. Plain server-side helper
 * (not a "use server" action) — called directly from Server Components, and
 * dashboard_layouts SELECT is open to any authenticated user (no financial
 * data in it), so no auth check is needed here beyond a valid client.
 */
export async function resolveDashboardLayout(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  storeId: string | null
): Promise<ResolvedDashboardLayout> {
  let row: { layout_config: unknown; theme_config: unknown } | null = null;

  if (storeId) {
    const { data } = await supabase
      .from("dashboard_layouts")
      .select("layout_config, theme_config")
      .eq("store_id", storeId)
      .is("user_id", null)
      .eq("is_active", true)
      .maybeSingle();
    row = data;
  }
  if (!row) {
    const { data } = await supabase
      .from("dashboard_layouts")
      .select("layout_config, theme_config")
      .is("store_id", null)
      .is("user_id", null)
      .eq("is_active", true)
      .maybeSingle();
    row = data;
  }

  if (!row) {
    return { layoutConfig: DEFAULT_LAYOUT_CONFIG, themeConfig: DEFAULT_THEME_CONFIG, isCustom: false };
  }

  const layoutParse = z.array(widgetConfigSchema).safeParse(row.layout_config);
  const themeParse = themeConfigSchema.safeParse(row.theme_config);

  return {
    layoutConfig: layoutParse.success && layoutParse.data.length > 0 ? layoutParse.data : DEFAULT_LAYOUT_CONFIG,
    themeConfig: themeParse.success ? themeParse.data : DEFAULT_THEME_CONFIG,
    isCustom: true,
  };
}
