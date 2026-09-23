"use client";

import { createClient } from "@/lib/supabase/client";

export interface SisterStoreStock {
  store_id: string;
  store_name: string;
  unit_number: string | null;
  floor_number: string | null;
  current_stock: number;
  retail_price: number;
}

/**
 * Calls the `check_mall_inventory(p_sku, p_exclude_store_id)` RPC, expected
 * to return stock for the same SKU across the mall's other stores. See
 * supabase/check_mall_inventory.sql for the function this assumes — it
 * isn't provisioned in every environment yet, so callers should treat a
 * missing-function error as "lookup unavailable" rather than a hard failure.
 */
export async function checkMallInventory(
  sku: string,
  excludeStoreId: string
): Promise<SisterStoreStock[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("check_mall_inventory", {
    p_sku: sku,
    p_exclude_store_id: excludeStoreId,
  });

  if (error) throw new Error(error.message);
  return (data ?? []) as SisterStoreStock[];
}
