import { z } from "zod";
import { productFormSchema } from "./schema";
import { validateGs1Barcode } from "@/lib/utils/gs1Validator";

/** A plain module (not "use server") so the builder UI, the server action and tests share it. */

export const MAX_VARIANTS = 200;

export interface VariantOption {
  name: string;
  values: string[];
}

export interface VariantRow {
  /** Stable identity: the option values joined, so edits survive regeneration. */
  key: string;
  attributes: Record<string, string>;
  /** Derived code, e.g. "BLK-S"; refreshed on every rebuild. */
  suffix: string;
  /** Hand-edited SKU; when absent the SKU is derived from the base SKU + suffix. */
  skuOverride?: string;
  barcode: string;
  retail_price: string;
  cost_price: string;
  current_stock: string;
}

const COLOR_CODES: Record<string, string> = {
  black: "BLK", white: "WHT", silver: "SLV", gold: "GLD", red: "RED", blue: "BLU", green: "GRN",
  grey: "GRY", gray: "GRY", brown: "BRN", pink: "PNK", yellow: "YLW", orange: "ORG", purple: "PRP",
  navy: "NVY", beige: "BGE", rose: "ROS", teal: "TEL",
};
const SIZE_CODES: Record<string, string> = {
  "extra small": "XS", small: "S", medium: "M", large: "L", "extra large": "XL", "double xl": "XXL",
};

/** "Black" → BLK, "Small" → S, "XL" → XL, "Midnight Blue" → MDN. */
export function abbreviateOption(value: string): string {
  const raw = value.trim().toLowerCase();
  if (COLOR_CODES[raw]) return COLOR_CODES[raw];
  if (SIZE_CODES[raw]) return SIZE_CODES[raw];
  const clean = raw.replace(/[^a-z0-9]/g, "").toUpperCase();
  if (clean.length <= 3) return clean || "X";
  // Keep the first letter, then prefer consonants so codes stay recognisable.
  const tail = clean.slice(1).replace(/[AEIOU]/g, "");
  return (clean[0] + tail + clean.slice(1)).slice(0, 3);
}

/** Per option, give every value a code that is unique within that option. */
function codesFor(values: string[]): Map<string, string> {
  const used = new Set<string>();
  const out = new Map<string, string>();
  for (const v of values) {
    let code = abbreviateOption(v);
    for (let n = 2; used.has(code); n++) code = `${abbreviateOption(v).slice(0, 2)}${n}`;
    used.add(code);
    out.set(v, code);
  }
  return out;
}

export function cleanOptions(options: VariantOption[]): VariantOption[] {
  return options
    .map((o) => ({
      name: o.name.trim(),
      values: [...new Set(o.values.map((v) => v.trim()).filter(Boolean))],
    }))
    .filter((o) => o.name && o.values.length > 0);
}

export function countCombinations(options: VariantOption[]): number {
  const cleaned = cleanOptions(options);
  return cleaned.length === 0 ? 0 : cleaned.reduce((n, o) => n * o.values.length, 1);
}

/** SKU suffix for a row, e.g. "BLK-S" (option order: Color then Size gives BASE-BLK-S). */
export function suffixFor(options: VariantOption[], attributes: Record<string, string>): string {
  return cleanOptions(options)
    .map((o) => codesFor(o.values).get(attributes[o.name]) ?? abbreviateOption(attributes[o.name] ?? ""))
    .join("-");
}

export function variantSku(baseSku: string, row: VariantRow): string {
  if (row.skuOverride) return row.skuOverride.toUpperCase();
  return `${baseSku.trim().toUpperCase()}-${row.suffix}`;
}

/**
 * Cartesian product of the options, preserving any edits already made to rows whose
 * combination still exists. New rows start from the defaults.
 */
export function buildVariantRows(
  options: VariantOption[],
  previous: VariantRow[],
  defaults: { retail_price: string; cost_price: string }
): VariantRow[] {
  const cleaned = cleanOptions(options);
  if (cleaned.length === 0) return [];
  const byKey = new Map(previous.map((r) => [r.key, r]));
  let combos: Record<string, string>[] = [{}];
  for (const o of cleaned) {
    combos = combos.flatMap((c) => o.values.map((v) => ({ ...c, [o.name]: v })));
    if (combos.length > MAX_VARIANTS) return previous; // caller shows the limit warning
  }
  return combos.map((attributes) => {
    const key = cleaned.map((o) => attributes[o.name]).join("|");
    const suffix = suffixFor(cleaned, attributes);
    const existing = byKey.get(key);
    return existing
      ? { ...existing, suffix }
      : {
          key,
          attributes,
          suffix,
          barcode: "",
          retail_price: defaults.retail_price,
          cost_price: defaults.cost_price,
          current_stock: "0",
        };
  });
}

const gs1Field = z
  .string()
  .trim()
  .max(64)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => !v || validateGs1Barcode(v).isValid, { message: "Invalid barcode: check digit mismatch" });

export const variantRowInputSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required").max(64).transform((s) => s.toUpperCase()),
  barcode: gs1Field,
  retail_price: z.coerce.number().min(0),
  cost_price: z.coerce.number().min(0),
  current_stock: z.coerce.number().int().min(0),
  variant_attributes: z.record(z.string(), z.string()),
});

export const variantProductSchema = productFormSchema
  .omit({ current_stock: true, barcode: true })
  .extend({ variants: z.array(variantRowInputSchema).min(1, "Add at least one variant").max(MAX_VARIANTS) })
  .superRefine((value, ctx) => {
    const skus = [value.sku.toUpperCase(), ...value.variants.map((v) => v.sku)];
    if (new Set(skus).size !== skus.length) {
      ctx.addIssue({ code: "custom", message: "Variant SKUs must be unique (case-insensitive)", path: ["variants"] });
    }
    const codes = value.variants.map((v) => v.barcode).filter((b): b is string => !!b);
    if (new Set(codes).size !== codes.length) {
      ctx.addIssue({ code: "custom", message: "Variant barcodes must be unique", path: ["variants"] });
    }
  });

export type VariantProductInput = z.input<typeof variantProductSchema>;
