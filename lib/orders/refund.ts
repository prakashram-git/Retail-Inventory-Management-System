"use client";

import { createClient } from "@/lib/supabase/client";
import type { ReturnLineSelection } from "./types";

export interface RefundParams {
  orderId: string;
  cashierId: string;
  items: ReturnLineSelection[];
  reason?: string | null;
}

/**
 * Calls `process_order_refund`. See supabase/process_order_refund.sql for the
 * assumed contract — validates each line doesn't exceed its remaining
 * (quantity - refunded_quantity), restocks products, and marks the order
 * refunded/partially_refunded. The credit slip total is computed by the
 * caller from the selected lines, since the RPC's return shape isn't
 * provisioned in every environment yet.
 */
export async function submitRefund(params: RefundParams): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("process_order_refund", {
    p_order_id: params.orderId,
    p_cashier_id: params.cashierId,
    p_items: params.items.map((item) => ({
      order_item_id: item.orderItemId,
      quantity: item.quantity,
    })),
    p_reason: params.reason ?? null,
  });

  if (error) throw new Error(error.message);
}
