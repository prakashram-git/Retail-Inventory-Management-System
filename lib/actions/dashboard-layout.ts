"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireLayoutEditor } from "./shared";

const widgetConfigSchema = z.object({
  id: z.string().min(1),
  visible: z.boolean(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1),
});

const themeConfigSchema = z.object({
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color"),
  glassOpacity: z.number().min(10).max(90),
  borderRadius: z.enum(["sharp", "rounded", "pill"]),
  monoNumbers: z.boolean(),
});

const publishInputSchema = z.object({
  layoutConfig: z.array(widgetConfigSchema).min(1),
  themeConfig: themeConfigSchema,
  scope: z.enum(["store", "global"]).default("store"),
});

export type PublishLayoutInput = z.input<typeof publishInputSchema>;

/**
 * Publishes a dashboard layout. "store" scope always targets the caller's
 * own store (never client-supplied) via requireLayoutEditor(); "global"
 * (the mall-wide default) is rejected server-side for anyone but
 * super_admin, mirroring updateAppearance()'s scope split — RLS enforces
 * the same boundary independently (add_ui_designer_role.sql), this just
 * gives a clean error instead of a raw 42501.
 */
export async function publishDashboardLayout(input: PublishLayoutInput) {
  const parsed = publishInputSchema.parse(input);
  const { supabase, role, storeId } = await requireLayoutEditor();

  if (parsed.scope === "global" && role !== "super_admin") {
    throw new Error("Only super admins can set the mall-wide default layout.");
  }

  const { data: userResult } = await supabase.auth.getUser();
  const targetStoreId = parsed.scope === "global" ? null : storeId;

  let existingQuery = supabase.from("dashboard_layouts").select("id").is("user_id", null);
  existingQuery = targetStoreId
    ? existingQuery.eq("store_id", targetStoreId)
    : existingQuery.is("store_id", null);
  const { data: existing } = await existingQuery.maybeSingle();

  const row = {
    layout_config: parsed.layoutConfig,
    theme_config: parsed.themeConfig,
    is_active: true,
    updated_by: userResult.user?.id,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await supabase.from("dashboard_layouts").update(row).eq("id", existing.id)
    : await supabase.from("dashboard_layouts").insert({ ...row, store_id: targetStoreId });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings/layout-builder");
}

const resetInputSchema = z.object({ scope: z.enum(["store", "global"]).default("store") });
export type ResetLayoutInput = z.input<typeof resetInputSchema>;

/** Deletes the custom row for this scope — the dashboard then falls back to DEFAULT_LAYOUT_CONFIG. */
export async function resetDashboardLayout(input: ResetLayoutInput) {
  const parsed = resetInputSchema.parse(input);
  const { supabase, role, storeId } = await requireLayoutEditor();

  if (parsed.scope === "global" && role !== "super_admin") {
    throw new Error("Only super admins can reset the mall-wide default layout.");
  }

  const targetStoreId = parsed.scope === "global" ? null : storeId;
  let query = supabase.from("dashboard_layouts").delete().is("user_id", null);
  query = targetStoreId ? query.eq("store_id", targetStoreId) : query.is("store_id", null);
  const { error } = await query;
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings/layout-builder");
}

