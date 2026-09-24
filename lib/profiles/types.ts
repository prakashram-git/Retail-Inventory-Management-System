export interface StoreFeatures {
  show_dashboard: boolean;
  allow_new_product: boolean;
  allow_new_category: boolean;
  allow_pos_shortcut: boolean;
  allow_reports_shortcut: boolean;
  allow_variant_matrix: boolean;
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
  "high_performance_mode",
] as const satisfies readonly (keyof Omit<StoreFeatures, "meta">)[];

export const FEATURE_LABELS: Record<(typeof FEATURE_KEYS)[number], string> = {
  show_dashboard: "Show dashboard",
  allow_new_product: "Allow new product",
  allow_new_category: "Allow new category",
  allow_pos_shortcut: "Allow POS shortcut",
  allow_reports_shortcut: "Allow reports shortcut",
  allow_variant_matrix: "Allow variant matrix",
  high_performance_mode: "High-performance mode (disables motion/blur)",
};

export interface StoreProfileDefinition {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  features: Record<string, boolean>;
}
