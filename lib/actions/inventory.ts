"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStoreContext } from "./shared";

// `damage` has no distinct Postgres enum value on inventory_logs.change_type
// (sale | restock | adjustment | return | shrinkage | offline_variance), so
// it's recorded as `shrinkage` like theft — the audit notes carry the
// specific cause, which is what the ledger actually needs to be reviewable.
const REASON_TO_CHANGE_TYPE = {
  restock: "restock",
  damage: "shrinkage",
  shrinkage: "shrinkage",
  adjustment: "adjustment",
} as const;

const adjustmentInputSchema = z.object({
  product_id: z.string().uuid(),
  reason: z.enum(["restock", "damage", "shrinkage", "adjustment"]),
  direction: z.enum(["increase", "decrease"]),
  quantity: z.coerce.number().int().positive("Quantity must be greater than 0"),
  notes: z.string().trim().min(1, "Audit notes are required").max(500),
});

export type StockAdjustmentInput = z.input<typeof adjustmentInputSchema>;

/**
 * Restocks, shrinkage, and manual corrections all move `products.current_stock`
 * directly and leave an inventory_logs entry — the same ledger process_pos_checkout
 * and process_order_refund write to for sales and returns, so every stock
 * movement (whatever caused it) is auditable from one table.
 */
export async function adjustStock(input: StockAdjustmentInput) {
  const parsed = adjustmentInputSchema.parse(input);
  const { supabase, storeId } = await requireStoreContext();

  const { data: userResult } = await supabase.auth.getUser();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, current_stock")
    .eq("id", parsed.product_id)
    .eq("store_id", storeId)
    .single();
  if (productError || !product) throw new Error("Product not found.");

  const delta = parsed.direction === "increase" ? parsed.quantity : -parsed.quantity;
  const newStock = product.current_stock + delta;
  if (newStock < 0) {
    throw new Error(
      `Cannot remove ${parsed.quantity} units — only ${product.current_stock} in stock.`
    );
  }

  const { error: updateError } = await supabase
    .from("products")
    .update({ current_stock: newStock })
    .eq("id", parsed.product_id)
    .eq("store_id", storeId);
  if (updateError) throw new Error(updateError.message);

  const { error: logError } = await supabase.from("inventory_logs").insert({
    store_id: storeId,
    product_id: parsed.product_id,
    change_type: REASON_TO_CHANGE_TYPE[parsed.reason],
    quantity: Math.abs(delta),
    previous_stock: product.current_stock,
    new_stock: newStock,
    notes: parsed.notes,
    created_by: userResult.user?.id,
  });
  if (logError) throw new Error(logError.message);

  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/reports");
}
