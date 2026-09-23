import type { CartLine } from "./types";

export interface CartTotals {
  taxableGross: number;
  exemptGross: number;
  /** Pre-tax subtotal — normalized to a pre-tax figure whether tax_model is inclusive or exclusive. */
  subtotal: number;
  tax: number;
  taxRatePercent: number;
  inclusive: boolean;
  discount: number;
  total: number;
  itemCount: number;
}

/**
 * `tax_model` "inclusive" means retail_price already contains tax, so it's
 * backed out of the taxable lines rather than added on top. Tax-exempt
 * categories (categories.is_tax_exempt) never contribute to the tax amount
 * either way.
 */
export function calculateCartTotals(
  cart: CartLine[],
  taxRatePercent: number,
  taxModel: string,
  discount: number
): CartTotals {
  let taxableGross = 0;
  let exemptGross = 0;
  let itemCount = 0;

  for (const line of cart) {
    const lineTotal = line.product.retail_price * line.quantity;
    if (line.product.category?.is_tax_exempt) {
      exemptGross += lineTotal;
    } else {
      taxableGross += lineTotal;
    }
    itemCount += line.quantity;
  }

  const inclusive = taxModel === "inclusive";
  const tax = inclusive
    ? taxableGross - taxableGross / (1 + taxRatePercent / 100)
    : taxableGross * (taxRatePercent / 100);

  const grossSubtotal = taxableGross + exemptGross;
  const subtotal = inclusive ? grossSubtotal - tax : grossSubtotal;
  const total = Math.max(0, subtotal + tax - discount);

  return {
    taxableGross,
    exemptGross,
    subtotal,
    tax,
    taxRatePercent,
    inclusive,
    discount,
    total,
    itemCount,
  };
}
