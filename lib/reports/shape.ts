import "server-only";
import type { PaymentMethod } from "@/lib/orders/types";
import type { ReportsSaleLine } from "./types";

/** Shape of an order_items row joined with its product and parent order, as
 * both the Reports page and the Dashboard home page query it. */
export interface SaleLineJoinRow {
  order_id: string;
  quantity: number;
  refunded_quantity: number;
  unit_price: number;
  product: { id: string; name: string; sku: string; category_id: string | null; cost_price: number } | null;
  order: {
    created_at: string;
    invoice_number: string;
    payment_method: PaymentMethod;
    cashier: { full_name: string | null; email: string | null } | null;
  };
}

export function mapSaleLineRows(rows: SaleLineJoinRow[]): ReportsSaleLine[] {
  return rows.map((row) => ({
    order_id: row.order_id,
    invoice_number: row.order.invoice_number,
    created_at: row.order.created_at,
    product_id: row.product?.id ?? "",
    product_name: row.product?.name ?? "Unknown product",
    product_sku: row.product?.sku ?? "",
    category_id: row.product?.category_id ?? null,
    quantity: row.quantity,
    refunded_quantity: row.refunded_quantity,
    unit_price: row.unit_price,
    cost_price: row.product?.cost_price ?? 0,
    payment_method: row.order.payment_method,
    cashier_name: row.order.cashier?.full_name ?? row.order.cashier?.email ?? "Unknown cashier",
  }));
}
