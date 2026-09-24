import { validateGS1Barcode } from "./barcode";

export type BarcodeType = "UPC-A" | "EAN-13" | "EAN-8" | "Custom";

export interface Gs1Result {
  isValid: boolean;
  type: BarcodeType;
}

const TYPE_BY_LENGTH: Record<number, BarcodeType> = { 8: "EAN-8", 12: "UPC-A", 13: "EAN-13" };

/**
 * Classifies a barcode and, for GS1 shapes (all digits, 8/12/13 long), checks the
 * modulo-10 check digit — weights 3,1,3,1… counted from the digit next to the check
 * digit, which is the rule that is correct for UPC-A *and* EAN-13 (counting odd
 * positions from the left only matches for 12-digit UPC-A). Anything else is a custom
 * in-house format and is reported valid, because it has no check digit to fail.
 * The digit math itself lives in ./barcode so the POS scanner, the product form schema
 * and this helper can never disagree.
 */
export function validateGs1Barcode(barcode: string): Gs1Result {
  const value = (barcode ?? "").trim();
  const type = /^\d+$/.test(value) ? (TYPE_BY_LENGTH[value.length] ?? "Custom") : "Custom";
  if (type === "Custom") return { isValid: true, type };
  return { isValid: validateGS1Barcode(value), type };
}
