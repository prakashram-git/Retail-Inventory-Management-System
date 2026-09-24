"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "./shared";
import { FEATURE_KEYS, type StoreProfileDefinition } from "@/lib/profiles/types";

interface ActionResult {
  success: boolean;
  error?: string;
}

function pickFeatures(input: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of FEATURE_KEYS) if (key in input) out[key] = !!input[key];
  return out;
}

/** Points a store at a profile, optionally with its own per-store overrides on top. */
export async function assignStoreProfileAction(
  storeId: string,
  profileId: string,
  overrides?: Record<string, boolean>
): Promise<ActionResult> {
  const { supabase } = await requireSuperAdmin();

  const { data: profileExists } = await supabase
    .from("store_profiles")
    .select("id")
    .eq("id", profileId)
    .maybeSingle();
  if (!profileExists) return { success: false, error: `Unknown profile "${profileId}".` };

  const { error } = await supabase
    .from("stores")
    .update({
      active_profile_id: profileId,
      custom_feature_overrides: overrides ? pickFeatures(overrides) : {},
    })
    .eq("id", storeId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/pos");
  revalidatePath("/dashboard/settings/profiles");
  return { success: true };
}

/** Edits a profile's own feature bundle — every store on that profile picks it up immediately. */
export async function updateProfileDefinitionAction(
  profileId: string,
  features: Record<string, boolean>
): Promise<ActionResult> {
  const { supabase } = await requireSuperAdmin();

  const { error } = await supabase
    .from("store_profiles")
    .update({ features: pickFeatures(features), updated_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/pos");
  revalidatePath("/dashboard/settings/profiles");
  return { success: true };
}

export async function listStoreProfilesAction(): Promise<StoreProfileDefinition[]> {
  const { supabase } = await requireSuperAdmin();
  const { data, error } = await supabase.from("store_profiles").select("*").order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as StoreProfileDefinition[];
}

export interface StoreAssignmentRow {
  id: string;
  name: string;
  active_profile_id: string | null;
  custom_feature_overrides: Record<string, boolean>;
}

export async function listStoreAssignmentsAction(): Promise<StoreAssignmentRow[]> {
  const { supabase } = await requireSuperAdmin();
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, active_profile_id, custom_feature_overrides")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as StoreAssignmentRow[];
}
