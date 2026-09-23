"use client";

import { createClient } from "@/lib/supabase/client";
import { db } from "@/lib/offline/db";
import type { CartLine, PaymentMethod } from "./types";

export interface CheckoutParams {
  idempotencyKey: string;
  storeId: string;
  sessionId: string;
  cashierId: string;
  cart: CartLine[];
  paymentMethod: PaymentMethod;
  discount: number;
  amountTendered: number;
  authCode?: string | null;
  cardBrand?: string | null;
  cardLastFour?: string | null;
  isOnline: boolean;
}

export interface CheckoutResult {
  idempotencyKey: string;
  invoiceNumber: string | null;
  offline: boolean;
}

/**
 * Calls `process_pos_checkout` when online. When offline, queues the same
 * RPC arguments in IndexedDB — replayOfflineQueue (lib/offline/sync.ts)
 * replays them against the same RPC once connectivity returns, so the
 * idempotency key guards against double-charging either way.
 */
export async function submitCheckout(params: CheckoutParams): Promise<CheckoutResult> {
  const items = params.cart.map((line) => ({
    product_id: line.product.id,
    quantity: line.quantity,
    unit_price: line.product.retail_price,
  }));

  const offlineTimestamp = new Date().toISOString();
  const offlineInvoice = `OFFLINE-${params.idempotencyKey.slice(0, 8).toUpperCase()}`;

  const rpcArgs = {
    p_idempotency_key: params.idempotencyKey,
    p_store_id: params.storeId,
    p_session_id: params.sessionId,
    p_cashier_id: params.cashierId,
    p_items: items,
    p_payment_method: params.paymentMethod,
    p_discount: params.discount,
    p_amount_tendered: params.amountTendered,
    p_auth_code: params.authCode ?? null,
    p_card_brand: params.cardBrand ?? null,
    p_card_last_four: params.cardLastFour ?? null,
    p_is_offline: !params.isOnline,
    p_offline_invoice: !params.isOnline ? offlineInvoice : null,
    p_offline_timestamp: !params.isOnline ? offlineTimestamp : null,
  };

  if (!params.isOnline) {
    await db.transaction("rw", db.offline_orders_queue, db.cached_products, async () => {
      await db.offline_orders_queue.add({
        idempotency_key: params.idempotencyKey,
        store_id: params.storeId,
        cashier_id: params.cashierId,
        session_id: params.sessionId,
        payload: rpcArgs,
        created_at: offlineTimestamp,
        sync_status: "pending",
        retry_count: 0,
      });

      // Keeps the offline catalog cache in sync with what was just sold, so
      // a second offline sale in the same outage can't oversell stock that
      // this transaction already committed to the queue.
      for (const line of params.cart) {
        const cached = await db.cached_products.get(line.product.id);
        if (cached) {
          await db.cached_products.update(line.product.id, {
            current_stock: Math.max(0, cached.current_stock - line.quantity),
          });
        }
      }
    });
    return { idempotencyKey: params.idempotencyKey, invoiceNumber: offlineInvoice, offline: true };
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("process_pos_checkout", rpcArgs);
  if (error) throw new Error(error.message);

  const invoiceNumber =
    (data && typeof data === "object" && "invoice_number" in data
      ? (data as { invoice_number?: string }).invoice_number
      : undefined) ?? null;

  return { idempotencyKey: params.idempotencyKey, invoiceNumber, offline: false };
}
