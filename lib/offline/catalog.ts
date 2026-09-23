import { db } from "./db";
import { createClient } from "@/lib/supabase/client";

/**
 * Mirrors the active store's product catalog into IndexedDB so POS lookups
 * keep working after connectivity drops. Replaces (rather than merges) the
 * cache so stale products from a previously active store don't linger.
 */
export async function syncStoreCatalog(storeId: string): Promise<void> {
  const supabase = createClient();

  const [{ data: products, error: productsError }, { data: categories, error: categoriesError }] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "id, store_id, sku, barcode, name, retail_price, current_stock, category_id, updated_at"
        )
        .eq("store_id", storeId),
      supabase
        .from("categories")
        .select("id, store_id, name, slug")
        .eq("store_id", storeId),
    ]);

  if (productsError || categoriesError) {
    throw productsError ?? categoriesError;
  }

  await db.transaction(
    "rw",
    db.cached_products,
    db.offline_categories,
    async () => {
      await db.cached_products.where("store_id").equals(storeId).delete();
      await db.offline_categories.where("store_id").equals(storeId).delete();
      if (products?.length) await db.cached_products.bulkPut(products);
      if (categories?.length) await db.offline_categories.bulkPut(categories);
    }
  );
}
