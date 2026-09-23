import Dexie, { type EntityTable } from "dexie";

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

const db = new Dexie("MallRetailOfflineDB") as Dexie & {
  cached_products: EntityTable<CachedProduct, "id">;
  offline_orders_queue: EntityTable<OfflineOrderQueueEntry, "idempotency_key">;
  offline_categories: EntityTable<OfflineCategory, "id">;
};

db.version(1).stores({
  cached_products:
    "id, store_id, sku, barcode, name, retail_price, current_stock, category_id, updated_at",
  offline_orders_queue:
    "idempotency_key, store_id, cashier_id, session_id, payload, created_at, sync_status, retry_count, last_error",
  offline_categories: "id, store_id, name, slug",
});

export { db };
