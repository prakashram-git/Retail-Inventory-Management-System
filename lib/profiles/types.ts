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
] as const;

export interface StoreProfileDefinition {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  features: Record<string, boolean>;
}
