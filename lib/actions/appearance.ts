"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/domain";

const appearanceInputSchema = z.object({
  home_background_url: z.string().url(),
  blur_strength: z.coerce.number().min(0).max(25),
  overlay_opacity: z.coerce.number().min(0.1).max(0.9),
});

export type AppearanceInput = z.input<typeof appearanceInputSchema>;

/**
 * "global" is the mall homepage wallpaper (system_settings.store_id IS NULL,
 * the login page's ultimate fallback), only settable by super_admin.
 * "store" is a manager's own store-specific login wallpaper, which takes
 * priority over the global one for logins scoped to that store.
 */
export async function updateAppearance(scope: "global" | "store", input: AppearanceInput) {
  const parsed = appearanceInputSchema.parse(input);
  const supabase = await createClient();

  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) throw new Error("Not authenticated");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, store_id")
    .eq("id", userResult.user.id)
    .single();
  if (profileError || !profile) throw new Error("Unable to resolve profile");

  const role = profile.role as UserRole;

  let storeId: string | null;
  if (scope === "global") {
    if (role !== "super_admin") {
      throw new Error("Only super admins can set the mall homepage wallpaper.");
    }
    storeId = null;
  } else {
    if (role !== "store_manager" && role !== "super_admin") {
      throw new Error("Not authorized.");
    }
    storeId = profile.store_id;
    if (!storeId) throw new Error("No store is assigned to this account.");
  }

  let existingQuery = supabase.from("system_settings").select("id");
  existingQuery = storeId ? existingQuery.eq("store_id", storeId) : existingQuery.is("store_id", null);
  const { data: existing } = await existingQuery.maybeSingle();

  const { error } = existing
    ? await supabase.from("system_settings").update(parsed).eq("id", existing.id)
    : await supabase.from("system_settings").insert({ ...parsed, store_id: storeId });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/settings/appearance");
  revalidatePath("/login");
}
