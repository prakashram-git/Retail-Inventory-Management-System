import type { PaymentMethod } from "@/lib/orders/types";

export interface ReportsCategory {
  id: string;
  name: string;
  parent_id: string | null;
}

/** A sold line item within the selected range, net of any refunded quantity. */
export interface ReportsSaleLine {
  order_id: string;
  invoice_number: string;
  created_at: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  category_id: string | null;
  quantity: number;
  refunded_quantity: number;
  unit_price: number;
  cost_price: number;
  payment_method: PaymentMethod;
  cashier_name: string;
}

export interface ReportsProduct {
  id: string;
  name: string;
  sku: string;
  category_id: string | null;
  current_stock: number;
  cost_price: number;
}

/** A minimal sale record spanning all history, used only for the dead-inventory audit. */
export interface ReportsSaleTouch {
  product_id: string;
  created_at: string;
  net_quantity: number;
}

export interface StockMovementRow {
  id: string;
  created_at: string;
  change_type: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  notes: string | null;
  product_name: string;
  product_sku: string;
  cost_price: number;
}

export interface TillSessionRow {
  id: string;
  cashier_name: string;
  opened_at: string;
  closed_at: string | null;
  opening_float: number;
  closing_counted_cash: number | null;
  expected_cash: number | null;
  discrepancy: number | null;
  status: "open" | "closed";
}
