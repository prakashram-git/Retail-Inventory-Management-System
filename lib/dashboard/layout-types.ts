/**
 * The Card Size Stepper only ever sets 3, 6, or 12 (Compact/Standard/
 * Full-Width) — but DEFAULT_LAYOUT_CONFIG below matches the shipped spec's
 * literal example JSON, which uses other 12-column-summing widths (8, 4, 7,
 * 5) for its out-of-the-box arrangement. w is any 1-12 column span so that
 * default is representable; the stepper just never produces anything but the
 * three preset values.
 */
export type WidgetSize = number;

export interface DashboardWidgetConfig {
  id: string;
  visible: boolean;
  x: number;
  y: number;
  w: WidgetSize;
  h: number;
  /** Only meaningful for widget_pinned_report today: { reportId: "REP-SALES-01" }. */
  config?: { reportId?: string };
}

export type BorderRadiusStyle = "sharp" | "rounded" | "pill";

export interface DashboardThemeConfig {
  accentColor: string;
  glassOpacity: number; // 10-90
  borderRadius: BorderRadiusStyle;
  monoNumbers: boolean;
}

export const DEFAULT_THEME_CONFIG: DashboardThemeConfig = {
  accentColor: "#6366f1",
  glassOpacity: 70,
  borderRadius: "rounded",
  monoNumbers: true,
};

interface WidgetCatalogEntry {
  id: string;
  label: string;
  description: string;
  kind: "metric" | "chart" | "widget";
}

/**
 * The fixed catalog of widgets the layout builder can arrange. Matches the
 * dashboard_layouts.layout_config JSON contract in
 * supabase/add_ui_designer_role.sql exactly — every id here must be one
 * HomeDashboard.tsx knows how to render (see WIDGET_ID list there).
 */
export const WIDGET_CATALOG: WidgetCatalogEntry[] = [
  { id: "metric_gross_revenue", label: "Gross Revenue", description: "Today's gross revenue", kind: "metric" },
  { id: "metric_net_profit", label: "Net Profit", description: "Today's net profit", kind: "metric" },
  { id: "metric_aov", label: "Average Order Value", description: "Today's AOV", kind: "metric" },
  { id: "metric_shrinkage", label: "Shrinkage", description: "Today's shrinkage value, at cost", kind: "metric" },
  {
    id: "chart_revenue_vs_cogs",
    label: "Revenue vs. COGS",
    description: "7-day revenue and cost-of-goods trend",
    kind: "chart",
  },
  {
    id: "widget_restock_alerts",
    label: "Restock Alerts",
    description: "Items below their reorder threshold, with a suggested order quantity",
    kind: "widget",
  },
  {
    id: "widget_recent_orders",
    label: "Recent Orders",
    description: "The latest completed sales",
    kind: "widget",
  },
  {
    id: "widget_dead_stock",
    label: "Dead Stock Monitor",
    description: "Active products with no sale in 45+ days",
    kind: "widget",
  },
  {
    id: "widget_executive_digest",
    label: "Executive Digest",
    description: "Flash daily / MTD / last-30-days KPIs with PDF and CSV export",
    kind: "widget",
  },
  {
    id: "widget_cashier_leaderboard",
    label: "Cashier Leaderboard",
    description: "SPLH, discount rate, voids/refunds, and a loss-prevention risk score per cashier",
    kind: "widget",
  },
  {
    id: "widget_dead_stock_aging",
    label: "Dead Stock Aging",
    description: "Capital locked in unsold inventory, bucketed by 30-59 / 60-89 / 90+ days",
    kind: "widget",
  },
  {
    id: "widget_hourly_heatmap",
    label: "Peak Trading Hours",
    description: "Order volume by day of week and hour",
    kind: "widget",
  },
  {
    id: "widget_sell_through",
    label: "Sell-Through Rate",
    description: "30-day sell-through vs. the 60-80% healthy retail corridor",
    kind: "widget",
  },
  {
    id: "widget_pinned_report",
    label: "Pinned Report",
    description: "Any one of the 24 Report Library templates, pinned to the dashboard (pick which one in the widget itself)",
    kind: "widget",
  },
];

export const DEFAULT_LAYOUT_CONFIG: DashboardWidgetConfig[] = [
  { id: "widget_executive_digest", visible: true, x: 0, y: 0, w: 12, h: 3 },
  { id: "metric_gross_revenue", visible: true, x: 0, y: 3, w: 3, h: 2 },
  { id: "metric_net_profit", visible: true, x: 3, y: 3, w: 3, h: 2 },
  { id: "metric_aov", visible: true, x: 6, y: 3, w: 3, h: 2 },
  { id: "metric_shrinkage", visible: true, x: 9, y: 3, w: 3, h: 2 },
  { id: "chart_revenue_vs_cogs", visible: true, x: 0, y: 5, w: 8, h: 4 },
  { id: "widget_restock_alerts", visible: true, x: 8, y: 5, w: 4, h: 4 },
  { id: "widget_cashier_leaderboard", visible: true, x: 0, y: 9, w: 7, h: 4 },
  { id: "widget_dead_stock_aging", visible: true, x: 7, y: 9, w: 5, h: 4 },
  { id: "widget_hourly_heatmap", visible: true, x: 0, y: 13, w: 8, h: 4 },
  { id: "widget_sell_through", visible: true, x: 8, y: 13, w: 4, h: 4 },
  { id: "widget_recent_orders", visible: true, x: 0, y: 17, w: 7, h: 4 },
  { id: "widget_dead_stock", visible: true, x: 7, y: 17, w: 5, h: 4 },
  // Hidden by default (no universal default report makes sense per store) —
  // included here so it always appears in the layout builder's widget list,
  // ready for a designer to toggle visible and pick a report, without
  // needing a separate "add a new widget" flow.
  { id: "widget_pinned_report", visible: false, x: 0, y: 21, w: 12, h: 4, config: { reportId: "REP-SALES-01" } },
];

/**
 * Recomputes x/y from an ordered, resized widget list via simple left-to-right
 * row packing on a 12-column grid — the builder edits order + width only (drag
 * to reorder, a size stepper), not freeform pixel placement, so coordinates
 * are always derived rather than hand-positioned. h is left as a per-kind
 * constant since row height isn't independently adjustable in this builder.
 */
export function packLayout(
  items: { id: string; visible: boolean; w: WidgetSize; config?: { reportId?: string } }[]
): DashboardWidgetConfig[] {
  let cursorX = 0;
  let cursorY = 0;
  return items.map((item) => {
    if (cursorX + item.w > 12) {
      cursorX = 0;
      cursorY += 1;
    }
    const config: DashboardWidgetConfig = {
      id: item.id,
      visible: item.visible,
      x: cursorX,
      y: cursorY,
      w: item.w,
      h: WIDGET_CATALOG.find((w) => w.id === item.id)?.kind === "metric" ? 2 : 4,
      ...(item.config ? { config: item.config } : {}),
    };
    cursorX += item.w;
    return config;
  });
}
