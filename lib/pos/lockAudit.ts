"use client";

import { createClient } from "@/lib/supabase/client";

export type LockEventType =
  | "locked"
  | "unlocked"
  | "cart_parked"
  | "cart_claimed"
  | "cart_discarded"
  | "unlock_failed"
  | "unlock_locked_out";

interface LogLockEventInput {
  storeId: string;
  userId: string;
  unitNumber: string | null;
  eventType: LockEventType;
  reason?: string;
  relatedUserId?: string;
}

/**
 * Best-effort audit write for the terminal_lock_events table (see
 * supabase/terminal_lock_audit.sql). Fire-and-forget by design: this is
 * telemetry for managers reviewing lock/cart-ownership history, not the
 * source of truth for cart state (Dexie is), so a failed write here (offline,
 * RLS denial) is swallowed rather than surfaced to the cashier.
 */
export function logLockEvent(input: LogLockEventInput): void {
  const supabase = createClient();
  void supabase
    .from("terminal_lock_events")
    .insert({
      store_id: input.storeId,
      user_id: input.userId,
      unit_number: input.unitNumber,
      event_type: input.eventType,
      reason: input.reason ?? null,
      related_user_id: input.relatedUserId ?? null,
    })
    .then(() => {});
}
