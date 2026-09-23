import type { Category, Product } from "@/lib/types/domain";

/** A product's own threshold wins; otherwise it falls back to its category's default. */
export function getEffectiveThreshold(
  product: Pick<Product, "min_threshold">,
  category: Pick<Category, "default_min_threshold"> | null | undefined
): number {
  if (product.min_threshold != null) return product.min_threshold;
  return category?.default_min_threshold ?? 5;
}

export function getStockStatus(
  currentStock: number,
  threshold: number
): "out" | "low" | "healthy" {
  if (currentStock <= 0) return "out";
  if (currentStock <= threshold) return "low";
  return "healthy";
}

export function computeMarginPercent(costPrice: number, retailPrice: number): number {
  if (retailPrice <= 0) return 0;
  return ((retailPrice - costPrice) / retailPrice) * 100;
}
