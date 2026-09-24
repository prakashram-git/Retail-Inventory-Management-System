export type ReportPillar = "sales" | "inventory" | "finance" | "audit" | "staff";

export type ReportColumnType = "string" | "number" | "currency" | "percent" | "date" | "datetime";

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
}

export type GroupByOption = "day" | "week" | "month" | "category" | "sku" | "cashier" | "store";

export interface ReportDefinition {
  id: string;
  pillar: ReportPillar;
  title: string;
  description: string;
  columns: ReportColumn[];
  groupByOptions?: GroupByOption[];
  defaultGroupBy?: GroupByOption;
  /** Reports whose output is fundamentally store-scoped even for a super_admin viewing "all stores" (e.g. a per-store comparison table already IS the multi-store view). */
  alwaysMultiStoreCapable?: boolean;
}

export const PILLAR_LABEL: Record<ReportPillar, string> = {
  sales: "Sales & Revenue",
  inventory: "Inventory & Merchandising",
  finance: "Cash Till & Financial Reconciliation",
  audit: "Loss Prevention & Audit",
  staff: "Staff & Labor Productivity",
};

export const REPORT_CATALOG: ReportDefinition[] = [
  // ---------------------------------------------------------------- SALES
  {
    id: "REP-SALES-01",
    pillar: "sales",
    title: "Sales Summary",
    description: "Gross, discounts, returns, net, tax, COGS, and gross margin % over time.",
    groupByOptions: ["day", "week", "month"],
    defaultGroupBy: "day",
    columns: [
      { key: "period", label: "Period", type: "string" },
      { key: "gross_sales", label: "Gross Sales", type: "currency" },
      { key: "discounts", label: "Discounts", type: "currency" },
      { key: "returns", label: "Returns", type: "currency" },
      { key: "net_sales", label: "Net Sales", type: "currency" },
      { key: "tax_collected", label: "Tax Collected", type: "currency" },
      { key: "cogs", label: "COGS", type: "currency" },
      { key: "gross_margin_pct", label: "Gross Margin %", type: "percent" },
    ],
  },
  {
    id: "REP-SALES-02",
    pillar: "sales",
    title: "Sales by Product / SKU",
    description: "Units sold, returns, gross, net, COGS, and margin % per SKU.",
    columns: [
      { key: "sku", label: "SKU", type: "string" },
      { key: "product_name", label: "Product", type: "string" },
      { key: "units_sold", label: "Units Sold", type: "number" },
      { key: "units_returned", label: "Units Returned", type: "number" },
      { key: "gross_sales", label: "Gross Sales", type: "currency" },
      { key: "net_sales", label: "Net Sales", type: "currency" },
      { key: "cogs", label: "COGS", type: "currency" },
      { key: "margin_pct", label: "Margin %", type: "percent" },
    ],
  },
  {
    id: "REP-SALES-03",
    pillar: "sales",
    title: "Sales by Category",
    description: "Performance aggregated by parent category and subcategory.",
    columns: [
      { key: "category_name", label: "Category", type: "string" },
      { key: "parent_category_name", label: "Parent Category", type: "string" },
      { key: "units_sold", label: "Units Sold", type: "number" },
      { key: "net_sales", label: "Net Sales", type: "currency" },
      { key: "cogs", label: "COGS", type: "currency" },
      { key: "margin_pct", label: "Margin %", type: "percent" },
    ],
  },
  {
    id: "REP-SALES-04",
    pillar: "sales",
    title: "Peak Trading Hours & Heatmap",
    description: "Sales volume grouped by day-of-week and hour, in store-local time.",
    columns: [
      { key: "day_of_week", label: "Day of Week", type: "string" },
      { key: "hour", label: "Hour", type: "string" },
      { key: "order_count", label: "Orders", type: "number" },
      { key: "revenue", label: "Revenue", type: "currency" },
    ],
  },
  {
    id: "REP-SALES-05",
    pillar: "sales",
    title: "Basket Size & UPT",
    description: "Ticket distribution, average units per transaction, and multi-buy rate.",
    columns: [
      { key: "invoice_number", label: "Invoice", type: "string" },
      { key: "created_at", label: "Date", type: "datetime" },
      { key: "units", label: "Units", type: "number" },
      { key: "distinct_skus", label: "Distinct SKUs", type: "number" },
      { key: "total", label: "Total", type: "currency" },
      { key: "is_multi_buy", label: "Multi-Buy (2+ SKUs)", type: "string" },
    ],
  },
  {
    id: "REP-SALES-06",
    pillar: "sales",
    title: "Channel & Sync Type",
    description: "In-store POS vs. offline-queued sync, by order count and revenue.",
    columns: [
      { key: "channel", label: "Channel", type: "string" },
      { key: "order_count", label: "Orders", type: "number" },
      { key: "net_sales", label: "Net Sales", type: "currency" },
      { key: "share_pct", label: "Share %", type: "percent" },
    ],
  },

  // ------------------------------------------------------------ INVENTORY
  {
    id: "REP-INV-01",
    pillar: "inventory",
    title: "Stock Valuation & Cost Summary",
    description: "On-hand quantity, total cost value, retail value, and unrealized margin.",
    columns: [
      { key: "sku", label: "SKU", type: "string" },
      { key: "product_name", label: "Product", type: "string" },
      { key: "current_stock", label: "On Hand", type: "number" },
      { key: "cost_value", label: "Cost Value", type: "currency" },
      { key: "retail_value", label: "Retail Value", type: "currency" },
      { key: "unrealized_margin", label: "Unrealized Margin", type: "currency" },
    ],
  },
  {
    id: "REP-INV-02",
    pillar: "inventory",
    title: "Low Stock & Reorder Trigger",
    description: "Items at or below their reorder threshold, with deficit and reorder cost.",
    columns: [
      { key: "sku", label: "SKU", type: "string" },
      { key: "product_name", label: "Product", type: "string" },
      { key: "current_stock", label: "On Hand", type: "number" },
      { key: "threshold", label: "Threshold", type: "number" },
      { key: "deficit", label: "Deficit", type: "number" },
      { key: "reorder_cost", label: "Reorder Cost", type: "currency" },
    ],
  },
  {
    id: "REP-INV-03",
    pillar: "inventory",
    title: "Dead Stock & Inventory Aging",
    description: "In-stock products with no sale in 30, 60, or 90+ days, with capital locked.",
    columns: [
      { key: "sku", label: "SKU", type: "string" },
      { key: "product_name", label: "Product", type: "string" },
      { key: "current_stock", label: "On Hand", type: "number" },
      { key: "days_since_sale", label: "Days Since Sale", type: "number" },
      { key: "bucket", label: "Aging Bucket", type: "string" },
      { key: "capital_locked", label: "Capital Locked", type: "currency" },
    ],
  },
  {
    id: "REP-INV-04",
    pillar: "inventory",
    title: "Sell-Through Rate Velocity",
    description: "30-day sell-through rate per item: units sold ÷ (stock + sold).",
    columns: [
      { key: "sku", label: "SKU", type: "string" },
      { key: "product_name", label: "Product", type: "string" },
      { key: "units_sold_30d", label: "Units Sold (30d)", type: "number" },
      { key: "current_stock", label: "On Hand", type: "number" },
      { key: "sell_through_pct", label: "Sell-Through %", type: "percent" },
    ],
  },
  {
    id: "REP-INV-05",
    pillar: "inventory",
    title: "Inventory Movement Ledger",
    description: "Audit of restock, sale, return, shrinkage, and offline-variance movements.",
    columns: [
      { key: "created_at", label: "Date", type: "datetime" },
      { key: "sku", label: "SKU", type: "string" },
      { key: "product_name", label: "Product", type: "string" },
      { key: "change_type", label: "Type", type: "string" },
      { key: "quantity", label: "Quantity", type: "number" },
      { key: "previous_stock", label: "Previous", type: "number" },
      { key: "new_stock", label: "New", type: "number" },
      { key: "notes", label: "Notes", type: "string" },
    ],
  },
  {
    id: "REP-INV-06",
    pillar: "inventory",
    title: "Consolidated Mall Stock",
    description: "Same-SKU stock availability compared across sister stores (super_admin, mall-wide).",
    alwaysMultiStoreCapable: true,
    columns: [
      { key: "sku", label: "SKU", type: "string" },
      { key: "product_name", label: "Product", type: "string" },
      { key: "store_name", label: "Store", type: "string" },
      { key: "current_stock", label: "On Hand", type: "number" },
    ],
  },

  // -------------------------------------------------------------- FINANCE
  {
    id: "REP-FIN-01",
    pillar: "finance",
    title: "End-of-Day Z-Report Rollup",
    description: "Session summaries: opening float, cash sales, and over/short variance.",
    columns: [
      { key: "cashier_name", label: "Cashier", type: "string" },
      { key: "opened_at", label: "Opened", type: "datetime" },
      { key: "closed_at", label: "Closed", type: "datetime" },
      { key: "opening_float", label: "Opening Float", type: "currency" },
      { key: "expected_cash", label: "Expected Cash", type: "currency" },
      { key: "closing_counted_cash", label: "Counted Cash", type: "currency" },
      { key: "discrepancy", label: "Discrepancy", type: "currency" },
      { key: "status", label: "Status", type: "string" },
    ],
  },
  {
    id: "REP-FIN-02",
    pillar: "finance",
    title: "Payment Method Breakdown",
    description: "Tender split across cash, card, and mall QR transfers.",
    columns: [
      { key: "method", label: "Method", type: "string" },
      { key: "order_count", label: "Orders", type: "number" },
      { key: "revenue", label: "Revenue", type: "currency" },
      { key: "share_pct", label: "Share %", type: "percent" },
    ],
  },
  {
    id: "REP-FIN-03",
    pillar: "finance",
    title: "Fiscal Tax Liability",
    description: "Taxable vs. tax-exempt sales and gross tax collected.",
    columns: [
      { key: "tax_status", label: "Tax Status", type: "string" },
      { key: "net_sales", label: "Net Sales", type: "currency" },
      { key: "tax_collected", label: "Tax Collected", type: "currency" },
    ],
  },
  {
    id: "REP-FIN-04",
    pillar: "finance",
    title: "Cash Drawer Discrepancy Audit",
    description: "Chronological ledger of every till variance with cashier notes.",
    columns: [
      { key: "opened_at", label: "Shift Date", type: "datetime" },
      { key: "cashier_name", label: "Cashier", type: "string" },
      { key: "discrepancy", label: "Discrepancy", type: "currency" },
      { key: "notes", label: "Notes", type: "string" },
    ],
  },

  // ---------------------------------------------------------------- AUDIT
  {
    id: "REP-AUD-01",
    pillar: "audit",
    title: "Returns & Refunds Audit",
    description: "Returned SKUs, original invoice, cashier, and refund totals.",
    columns: [
      { key: "invoice_number", label: "Invoice", type: "string" },
      { key: "sku", label: "SKU", type: "string" },
      { key: "product_name", label: "Product", type: "string" },
      { key: "cashier_name", label: "Cashier", type: "string" },
      { key: "refunded_quantity", label: "Qty Refunded", type: "number" },
      { key: "refund_amount", label: "Refund Amount", type: "currency" },
    ],
  },
  {
    id: "REP-AUD-02",
    pillar: "audit",
    title: "Discount Leakage & Markdowns",
    description: "Frequency, dollar volume, and % impact of order-level discounts.",
    columns: [
      { key: "invoice_number", label: "Invoice", type: "string" },
      { key: "created_at", label: "Date", type: "datetime" },
      { key: "cashier_name", label: "Cashier", type: "string" },
      { key: "subtotal", label: "Subtotal", type: "currency" },
      { key: "discount", label: "Discount", type: "currency" },
      { key: "discount_pct", label: "Discount %", type: "percent" },
    ],
  },
  {
    id: "REP-AUD-03",
    pillar: "audit",
    title: "Post-Void & Canceled Orders",
    description: "Voided orders, the cashier responsible, and time-to-void.",
    columns: [
      { key: "invoice_number", label: "Invoice", type: "string" },
      { key: "created_at", label: "Date", type: "datetime" },
      { key: "cashier_name", label: "Cashier", type: "string" },
      { key: "total", label: "Total", type: "currency" },
    ],
  },
  {
    id: "REP-AUD-04",
    pillar: "audit",
    title: "SHA-256 Fiscal Chain Audit",
    description: "Verifies each order's previous_order_hash links to the prior order's current_order_hash.",
    columns: [
      { key: "invoice_number", label: "Invoice", type: "string" },
      { key: "created_at", label: "Date", type: "datetime" },
      { key: "current_order_hash", label: "Hash", type: "string" },
      { key: "chain_status", label: "Chain Status", type: "string" },
    ],
  },

  // ---------------------------------------------------------------- STAFF
  {
    id: "REP-STF-01",
    pillar: "staff",
    title: "Cashier Sales Leaderboard",
    description: "Ranked by sales volume, transaction count, AOV, and drawer accuracy.",
    columns: [
      { key: "cashier_name", label: "Cashier", type: "string" },
      { key: "total_sales_volume", label: "Sales", type: "currency" },
      { key: "transaction_count", label: "Orders", type: "number" },
      { key: "average_ticket_size", label: "AOV", type: "currency" },
      { key: "net_drawer_discrepancy", label: "Drawer Accuracy", type: "currency" },
    ],
  },
  {
    id: "REP-STF-02",
    pillar: "staff",
    title: "Sales Per Labor Hour (SPLH)",
    description: "Net sales divided by active till-session hours, per cashier.",
    columns: [
      { key: "cashier_name", label: "Cashier", type: "string" },
      { key: "total_sales_volume", label: "Net Sales", type: "currency" },
      { key: "total_hours_worked", label: "Hours Worked", type: "number" },
      { key: "splh", label: "SPLH", type: "currency" },
    ],
  },
  {
    id: "REP-STF-03",
    pillar: "staff",
    title: "Staff Markdown & Return Frequency",
    description: "Share of each cashier's transactions containing a discount or a refund.",
    columns: [
      { key: "cashier_name", label: "Cashier", type: "string" },
      { key: "transaction_count", label: "Orders", type: "number" },
      { key: "discount_frequency_rate", label: "Discount Rate %", type: "percent" },
      { key: "refund_count", label: "Refunds", type: "number" },
      { key: "refund_rate_pct", label: "Refund Rate %", type: "percent" },
    ],
  },
  {
    id: "REP-STF-04",
    pillar: "staff",
    title: "Cashier Speed of Service",
    description: "Average transactions rung per labor hour (no per-transaction duration is tracked, so ringing time is approximated from this rate).",
    columns: [
      { key: "cashier_name", label: "Cashier", type: "string" },
      { key: "transaction_count", label: "Orders", type: "number" },
      { key: "total_hours_worked", label: "Hours Worked", type: "number" },
      { key: "orders_per_hour", label: "Orders / Hour", type: "number" },
    ],
  },
];

export function getReportDefinition(reportId: string): ReportDefinition | undefined {
  return REPORT_CATALOG.find((r) => r.id === reportId);
}
