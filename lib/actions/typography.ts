"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { typographySettingsSchema, type TypographySettings } from "@/lib/theme/typography-shared";

export async function updateTypographySettings(input: TypographySettings) {
  const parsed = typographySettingsSchema.parse(input);
  const supabase = await createClient();

  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) throw new Error("Not authenticated");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userResult.user.id)
    .single();
  if (profileError || !profile) throw new Error("Unable to resolve profile");
  if (profile.role !== "super_admin") {
    throw new Error("Only super admins can change app-wide typography.");
  }

  const { data: existing } = await supabase
    .from("system_settings")
    .select("id")
    .is("store_id", null)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("system_settings").update(parsed).eq("id", existing.id)
    : await supabase.from("system_settings").insert({ ...parsed, store_id: null });

  if (error) throw new Error(error.message);

  // Layout, not just the settings page — every form in the app reads this.
  revalidatePath("/", "layout");
}
