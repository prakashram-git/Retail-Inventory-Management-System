"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "./shared";

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
