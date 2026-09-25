"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "./shared";
import {
  EXECUTIVE_KPI_IDS,
  EXECUTIVE_WIDGET_IDS,
  FEATURE_KEYS,
  executiveKpiFeatureKey,
  executiveWidgetFeatureKey,
  type StoreProfileDefinition,
} from "@/lib/profiles/types";

interface ActionResult {
  success: boolean;
  error?: string;
}

// The fixed feature toggles plus one per executive widget (exec_widget_<id>) — anything else
// in the input is dropped rather than saved, so a stray/typo'd key can't silently persist.
const KNOWN_KEYS = new Set<string>([
  ...FEATURE_KEYS,
  ...EXECUTIVE_WIDGET_IDS.map(executiveWidgetFeatureKey),
  ...EXECUTIVE_KPI_IDS.map(executiveKpiFeatureKey),
]);

function pickFeatures(input: Record<string, boolean>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of Object.keys(input)) if (KNOWN_KEYS.has(key)) out[key] = !!input[key];
  return out;
}

/**
 * Points a store at a profile. `overrides`, when passed, REPLACES the store's per-store
 * overrides with exactly that set (an explicit `{}` clears them); when omitted, existing
 * overrides are left untouched — switching a store from the Store Assignment dropdown must
 * not silently discard customizations someone already made for it.
 */
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

  const patch: { active_profile_id: string; custom_feature_overrides?: Record<string, boolean> } = {
    active_profile_id: profileId,
  };
  if (overrides !== undefined) patch.custom_feature_overrides = pickFeatures(overrides);

  const { error } = await supabase.from("stores").update(patch).eq("id", storeId);
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

  const { data: existing } = await supabase
    .from("store_profiles")
    .select("id")
    .eq("id", profileId)
    .maybeSingle();
  if (!existing) return { success: false, error: `Unknown profile "${profileId}".` };

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
