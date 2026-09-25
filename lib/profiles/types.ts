export interface StoreFeatures {
  show_dashboard: boolean;
  allow_new_product: boolean;
  allow_new_category: boolean;
  allow_pos_shortcut: boolean;
  allow_reports_shortcut: boolean;
  allow_variant_matrix: boolean;
  /** Gates the BI-tier dashboard widgets (see EXECUTIVE_WIDGET_IDS) independently of show_dashboard. */
  allow_executive_widgets: boolean;
  high_performance_mode: boolean;
  /**
   * Not a database column — derived client hint set when high_performance_mode is on, so a
   * "lite" tablet skips motion/blur without every consumer re-deriving it from the flag.
   */
  meta: { disableMotion: boolean; disableBlur: boolean };
  /**
   * The full merged jsonb (profile.features shallow-merged with the store's own overrides),
   * untyped — this is where per-widget executive picks (see executiveWidgetFeatureKey) live.
   * They aren't part of the typed fields above because the set of widgets can grow without a
   * migration: a key simply absent from `raw` means "not yet customized", not "off" — see
   * isExecutiveWidgetEnabled.
   */
  raw: Record<string, boolean>;
}

export const FEATURE_KEYS = [
  "show_dashboard",
  "allow_new_product",
  "allow_new_category",
  "allow_pos_shortcut",
  "allow_reports_shortcut",
  "allow_variant_matrix",
  "allow_executive_widgets",
  "high_performance_mode",
] as const satisfies readonly (keyof Omit<StoreFeatures, "meta">)[];

export const FEATURE_LABELS: Record<(typeof FEATURE_KEYS)[number], string> = {
  show_dashboard: "Show dashboard",
  allow_new_product: "Allow new product",
  allow_new_category: "Allow new category",
  allow_pos_shortcut: "Allow POS shortcut",
  allow_reports_shortcut: "Allow reports shortcut",
  allow_variant_matrix: "Allow variant matrix",
  allow_executive_widgets: "Show executive widgets (Executive Digest, Cashier Leaderboard, BI charts)",
  high_performance_mode: "High-performance mode (disables motion/blur)",
};

/**
 * Widget ids (lib/dashboard/layout-types.ts WIDGET_CATALOG) treated as "executive"/BI tier —
 * hidden when a store's allow_executive_widgets is off, regardless of the store's own layout
 * config. Kept here (not in layout-types.ts) so the profile system's policy about *which*
 * widgets count as executive lives next to the flag that enforces it.
 */
export const EXECUTIVE_WIDGET_IDS = [
  "widget_executive_digest",
  "chart_revenue_vs_cogs",
  "widget_cashier_leaderboard",
  "widget_dead_stock_aging",
  "widget_hourly_heatmap",
  "widget_sell_through",
  "widget_pinned_report",
  // The four standalone financial metric tiles are grouped in here too — same reasoning as
  // the BI widgets above (sensitive-enough figures that a profile may want to hide) and it
  // means they get the same master switch + per-item picker for free.
  "metric_gross_revenue",
  "metric_net_profit",
  "metric_aov",
  "metric_shrinkage",
] as const;

/** The `features` jsonb key that selects one executive widget in or out of a profile. */
export function executiveWidgetFeatureKey(widgetId: string): string {
  return `exec_widget_${widgetId}`;
}

/**
 * A widget is enabled only when the category master switch is on AND it hasn't been
 * individually turned off. Absent from `raw` (no profile has ever saved a pick for it — e.g.
 * a brand-new widget added to EXECUTIVE_WIDGET_IDS after profiles were last edited) defaults
 * to enabled, the same "never silently take something away that was already showing" rule
 * `allow_executive_widgets` itself follows.
 */
export function isExecutiveWidgetEnabled(features: Pick<StoreFeatures, "allow_executive_widgets" | "raw">, widgetId: string): boolean {
  if (!features.allow_executive_widgets) return false;
  return features.raw[executiveWidgetFeatureKey(widgetId)] !== false;
}

/**
 * The 8 KPI cards inside the Executive Digest widget's Flash Daily / Last 30 Days view
 * (Gross sales, Net sales, UPT, AOV, Discount leakage, Total margin loss, Gross profit, Gross
 * margin) aren't separate dashboard widgets, so they need their own id list and feature-key
 * namespace, one level below `widget_executive_digest` itself.
 */
export const EXECUTIVE_KPI_IDS = [
  "kpi_gross_sales",
  "kpi_net_sales",
  "kpi_upt",
  "kpi_aov",
  "kpi_discount_leakage",
  "kpi_margin_loss",
  "kpi_gross_profit",
  "kpi_gross_margin",
] as const;

export const EXECUTIVE_KPI_LABELS: Record<(typeof EXECUTIVE_KPI_IDS)[number], string> = {
  kpi_gross_sales: "Gross sales",
  kpi_net_sales: "Net sales",
  kpi_upt: "UPT",
  kpi_aov: "AOV",
  kpi_discount_leakage: "Discount leakage",
  kpi_margin_loss: "Total margin loss (discount)",
  kpi_gross_profit: "Gross profit",
  kpi_gross_margin: "Gross margin",
};

export function executiveKpiFeatureKey(kpiId: string): string {
  return `exec_kpi_${kpiId}`;
}

/** Same rule as isExecutiveWidgetEnabled: gated by the master switch, unset defaults to on. */
export function isExecutiveKpiEnabled(features: Pick<StoreFeatures, "allow_executive_widgets" | "raw">, kpiId: string): boolean {
  if (!features.allow_executive_widgets) return false;
  return features.raw[executiveKpiFeatureKey(kpiId)] !== false;
}

export interface StoreProfileDefinition {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  features: Record<string, boolean>;
}
