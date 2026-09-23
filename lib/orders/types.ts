export type OrderStatus =
  | "completed"
  | "completed_with_stock_variance"
  | "refunded"
  | "partially_refunded"
  | "voided";

export type PaymentMethod = "cash" | "card" | "qr_transfer";

export interface OrderItemRow {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  refunded_quantity: number;
  product: { id: string; name: string; sku: string } | null;
}

export interface OrderRow {
  id: string;
  store_id: string;
  invoice_number: string;
  cashier_id: string;
  currency: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  payment_method: PaymentMethod;
  amount_tendered: number | null;
  change_due: number;
  payment_auth_code: string | null;
  card_brand: string | null;
  card_last_four: string | null;
  is_offline_sync: boolean;
  previous_order_hash: string | null;
  current_order_hash: string;
  status: OrderStatus;
  created_at: string;
  cashier: { id: string; full_name: string | null; email: string | null } | null;
  order_items: OrderItemRow[];
}

export interface ReturnLineSelection {
  orderItemId: string;
  quantity: number;
}
