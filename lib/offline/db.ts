import Dexie, { type EntityTable } from "dexie";
import type { CartLine } from "@/lib/pos/types";

export interface CachedProduct {
  id: string;
  store_id: string;
  sku: string;
  barcode: string;
  name: string;
  retail_price: number;
  current_stock: number;
  category_id: string;
  updated_at: string;
}

export type SyncStatus = "pending" | "syncing" | "synced" | "failed";

export interface OfflineOrderQueueEntry {
  idempotency_key: string;
  store_id: string;
  cashier_id: string;
  session_id: string;
  payload: unknown;
  created_at: string;
  sync_status: SyncStatus;
  retry_count: number;
  last_error?: string;
}

export interface OfflineCategory {
  id: string;
  store_id: string;
  name: string;
  slug: string;
}

export interface ParkedCart {
  /** `${store_id}:${user_id}` — one parked cart per cashier per store. */
  id: string;
  store_id: string;
  user_id: string;
  lines: CartLine[];
  parked_at: string;
}

export interface OfflineHelpWorkflow {
  id: string;
  /** Role the payload was fetched for — a role change invalidates the cache. */
  cached_for_role: string;
  category_id: string;
  category_title: string;
  title: string;
  summary: string;
  allowed_roles: string[];
  target_route: string | null;
  estimated_time_min: number;
  version: string;
  drift_detected: boolean;
  steps: unknown[];
  /** step_number -> Base64/SVG fallback illustration data URI (desktop). */
  illustrations: Record<number, string>;
  cached_at: string;
}

const db = new Dexie("MallRetailOfflineDB") as Dexie & {
  cached_products: EntityTable<CachedProduct, "id">;
  offline_orders_queue: EntityTable<OfflineOrderQueueEntry, "idempotency_key">;
  offline_categories: EntityTable<OfflineCategory, "id">;
  offline_help_workflows: EntityTable<OfflineHelpWorkflow, "id">;
  parked_carts: EntityTable<ParkedCart, "id">;
};

db.version(1).stores({
  cached_products:
    "id, store_id, sku, barcode, name, retail_price, current_stock, category_id, updated_at",
  offline_orders_queue:
    "idempotency_key, store_id, cashier_id, session_id, payload, created_at, sync_status, retry_count, last_error",
  offline_categories: "id, store_id, name, slug",
});

db.version(2).stores({
  offline_help_workflows: "id, category_id, cached_for_role, version, cached_at",
});

db.version(3).stores({
  parked_carts: "id, store_id, user_id, parked_at",
});

export { db };
