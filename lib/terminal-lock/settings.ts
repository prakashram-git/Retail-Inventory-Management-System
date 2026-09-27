import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PCI DSS v4.0 8.2.8: a session timeout must be <= 15 minutes. 60s is the
 * shortest preset offered in the settings UI.
 */
export const terminalLockSettingsSchema = z.object({
  inactivity_timeout_seconds: z.number().int().min(60).max(900),
  lock_on_order_complete: z.boolean(),
  lock_on_drawer_close: z.boolean(),
});

export type TerminalLockSettings = z.infer<typeof terminalLockSettingsSchema>;

const FALLBACK: TerminalLockSettings = {
  inactivity_timeout_seconds: 300,
  lock_on_order_complete: false,
  lock_on_drawer_close: true,
};

/**
 * Reads a store's terminal lock config from system_settings, falling back to
 * the same defaults as the DB columns if the row is missing entirely — a
 * missing row should never leave a terminal without a PCI-compliant timeout.
 */
export async function getTerminalLockSettings(
  supabase: SupabaseClient,
  storeId: string
): Promise<TerminalLockSettings> {
  const { data } = await supabase
    .from("system_settings")
    .select("inactivity_timeout_seconds, lock_on_order_complete, lock_on_drawer_close")
    .eq("store_id", storeId)
    .maybeSingle();

  if (!data) return FALLBACK;

  const parsed = terminalLockSettingsSchema.safeParse(data);
  return parsed.success ? parsed.data : FALLBACK;
}
