export interface ExecutiveDigestDaily {
  gross_sales: number;
  net_sales: number;
  order_count: number;
  aov: number;
  upt: number;
  cogs: number;
  gross_profit: number;
  gross_margin_pct: number;
  discount_total: number;
  discount_leakage_pct: number;
  tax_collected: number;
  dod_delta_pct: number;
  wow_delta_pct: number;
}

export interface ExecutiveDigestMtd {
  net_sales: number;
  cogs: number;
  gross_margin_pct: number;
  refunds_total: number;
  projected_month_end: number;
  mom_growth_pct: number;
  days_elapsed: number;
  days_in_month: number;
}

export interface ExecutiveDigest {
  target_date: string;
  timezone: string;
  daily: ExecutiveDigestDaily;
  mtd: ExecutiveDigestMtd;
}

export type RiskScore = "low" | "medium" | "high";

export interface CashierPerformanceRow {
  cashier_id: string;
  cashier_name: string;
  role: string;
  total_sales_volume: number;
  transaction_count: number;
  total_hours_worked: number;
  splh: number;
  average_ticket_size: number;
  total_units: number;
  items_per_transaction: number;
  discount_frequency_rate: number;
  void_count: number;
  refund_count: number;
  refund_amount: number;
  net_drawer_discrepancy: number;
  risk_score: RiskScore;
}

export interface InventoryHealthBucket {
  bucket: "30-59" | "60-89" | "90+";
  sku_count: number;
  capital_locked: number;
}

export interface InventoryVelocityRow {
  id: string;
  name: string;
  sku: string;
  units_30d: number;
}

export interface InventoryHealthMetrics {
  dead_stock_aging: InventoryHealthBucket[];
  sell_through_rate_30d: number;
  fast_movers: InventoryVelocityRow[];
  slow_movers: InventoryVelocityRow[];
}

export interface HeatmapCell {
  day: number; // 0 = Sunday .. 6 = Saturday, local to the store's timezone
  hour: number; // local hour, 0-23
  orderCount: number;
  revenue: number;
}
