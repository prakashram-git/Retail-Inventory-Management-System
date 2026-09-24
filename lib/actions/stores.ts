"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "./shared";
import { createAdminClient } from "@/lib/supabase/admin";

const storeInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  code: z.string().trim().min(1, "Code is required").max(20),
  unit_number: z.string().trim().min(1, "Unit number is required").max(20),
  floor_number: z.string().trim().max(20).nullable(),
  currency: z.string().trim().length(3, "Use a 3-letter currency code").toUpperCase(),
  locale: z.string().trim().min(2).max(20),
  timezone: z.string().trim().min(1, "Timezone is required"),
  tax_model: z.enum(["inclusive", "exclusive"]),
  is_active: z.boolean().default(true),
});

export type StoreInput = z.input<typeof storeInputSchema>;

export async function createStore(input: StoreInput) {
  const parsed = storeInputSchema.parse(input);
  const { supabase } = await requireSuperAdmin();

  const { error } = await supabase.from("stores").insert(parsed);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/settings/stores");
}

export async function updateStore(id: string, input: StoreInput) {
  const parsed = storeInputSchema.parse(input);
  const { supabase } = await requireSuperAdmin();

  const { error } = await supabase.from("stores").update(parsed).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/settings/stores");
}

/**
 * Attempts a real delete first; falls back to deactivating when the store
 * has products, orders, categories, or staff referencing it — those foreign
 * keys have no cascade (same reasoning as deleteProduct being a soft
 * delete), so a hard delete on a store with any history fails.
 */
export async function deleteStore(id: string) {
  await requireSuperAdmin();

  const admin = createAdminClient();
  const { error } = await admin.from("stores").delete().eq("id", id);
  if (error) {
    const { error: deactivateError } = await admin
      .from("stores")
      .update({ is_active: false })
      .eq("id", id);
    if (deactivateError) throw new Error(deactivateError.message);
    revalidatePath("/dashboard/settings/stores");
    return { softDeleted: true };
  }

  revalidatePath("/dashboard/settings/stores");
  return { softDeleted: false };
}
