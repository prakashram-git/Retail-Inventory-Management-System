"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "./shared";
import { terminalLockSettingsSchema, type TerminalLockSettings } from "@/lib/terminal-lock/settings";

export async function updateTerminalLockSettings(storeId: string, input: TerminalLockSettings) {
  const parsed = terminalLockSettingsSchema.parse(input);
  const { supabase } = await requireSuperAdmin();

  // Upsert rather than update: a store may not have a system_settings row yet
  // (the POS page reads it with maybeSingle for the same reason).
  const { error } = await supabase
    .from("system_settings")
    .upsert({ store_id: storeId, ...parsed }, { onConflict: "store_id" });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/settings");
}
