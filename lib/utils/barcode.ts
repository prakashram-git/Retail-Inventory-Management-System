const VALID_LENGTHS = new Set([8, 12, 13]);

/**
 * Validates GTIN-8, GTIN-12 (UPC-A), and GTIN-13 (EAN-13) barcodes using the
 * GS1 modulo-10 check digit algorithm.
 */
export function validateGS1Barcode(barcode: string): boolean {
  if (typeof barcode !== "string") return false;

  const trimmed = barcode.trim();
  if (!/^\d+$/.test(trimmed)) return false;
  if (!VALID_LENGTHS.has(trimmed.length)) return false;

  const digits = trimmed.split("").map(Number);
  const checkDigit = digits.pop() as number;

  // Weighting alternates 3/1 from the rightmost payload digit inward,
  // per the GS1 General Specifications.
  let sum = 0;
  for (let i = digits.length - 1, position = 0; i >= 0; i--, position++) {
    const weight = position % 2 === 0 ? 3 : 1;
    sum += digits[i] * weight;
  }

  const calculatedCheckDigit = (10 - (sum % 10)) % 10;

  return calculatedCheckDigit === checkDigit;
}
