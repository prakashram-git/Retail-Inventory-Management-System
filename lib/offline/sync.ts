import { db, type OfflineOrderQueueEntry } from "./db";
import { createClient } from "@/lib/supabase/client";

const UNSYNCED_STATUSES: OfflineOrderQueueEntry["sync_status"][] = [
  "pending",
  "failed",
];

export async function getPendingSyncCount(): Promise<number> {
  return db.offline_orders_queue
    .where("sync_status")
    .anyOf(UNSYNCED_STATUSES)
    .count();
}

export interface ReplayResult {
  synced: number;
  failed: number;
}

/**
 * Replays queued offline orders against Supabase, keyed by idempotency_key
 * so a retried entry can never create a duplicate order.
 */
export async function replayOfflineQueue(): Promise<ReplayResult> {
  const entries = await db.offline_orders_queue
    .where("sync_status")
    .anyOf(UNSYNCED_STATUSES)
    .toArray();

  if (entries.length === 0) {
    return { synced: 0, failed: 0 };
  }

  const supabase = createClient();
  let synced = 0;
  let failed = 0;

  for (const entry of entries) {
    await db.offline_orders_queue.update(entry.idempotency_key, {
      sync_status: "syncing",
    });

    try {
      // The payload holds the exact process_pos_checkout RPC args captured
      // at sale time (see lib/pos/checkout.ts), not raw order columns, so it
      // must be replayed through the same RPC rather than upserted directly
      // — that RPC also decrements stock and writes the hash-chained ledger.
      const { error } = await supabase.rpc(
        "process_pos_checkout",
        entry.payload as Record<string, unknown>
      );

      if (error) throw error;

      await db.offline_orders_queue.update(entry.idempotency_key, {
        sync_status: "synced",
      });
      synced++;
    } catch (err) {
      await db.offline_orders_queue.update(entry.idempotency_key, {
        sync_status: "failed",
        retry_count: entry.retry_count + 1,
        last_error: err instanceof Error ? err.message : "Unknown sync error",
      });
      failed++;
    }
  }

  return { synced, failed };
}
