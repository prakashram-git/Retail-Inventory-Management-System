import { z } from "zod";

/**
 * Column order for the downloadable template and for parseCsv's header
 * mapping — keep public/templates/products-import-template.csv in sync with
 * this if it ever changes.
 *
 * "sku" and "barcode" are deliberately left out of the default template: most
 * store owners importing a catalog for the first time don't have SKUs yet,
 * and a blank SKU column is just one more thing to explain. Both columns are
 * still fully supported — parseCsv reads by header name, not position — so a
 * store that already tracks SKUs/barcodes can add either column back in and
 * it's picked up automatically; any row that omits or blanks its SKU still
 * gets one generated at import time (see validateProductsCsvAction).
 */
export const PRODUCT_CSV_COLUMNS = [
  "name",
  "category_name",
  "tags",
  "description",
  "cost_price",
  "retail_price",
  "current_stock",
  "min_threshold",
  "image_url",
  "is_active",
  "sku",
  "barcode",
] as const;

const truthy = (value: string) => value === "true" || value === "1" || value === "yes";

/**
 * Raw-cell shape of one CSV row: every value arrives as a string (or is
 * missing entirely, hence the string|undefined). This only coerces/splits
 * CSV-specific concerns (category by name, delimited tags, string booleans);
 * the actual business rules (price >= 0, GS1 check digit, name length, ...)
 * are validated afterwards by re-running the resolved row through the real
 * productFormSchema (lib/products/schema.ts), so the CSV path can never
 * accept something createProduct would reject.
 */
export const productCsvRowSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  sku: z.string().trim().optional().default(""),
  barcode: z.string().trim().optional().default(""),
  category_name: z.string().trim().optional().default(""),
  tags: z.string().trim().optional().default(""),
  description: z.string().trim().optional().default(""),
  cost_price: z.coerce.number({ invalid_type_error: "Cost price must be a number" }).min(0, "Cost must be 0 or more"),
  retail_price: z.coerce
    .number({ invalid_type_error: "Retail price must be a number" })
    .min(0, "Retail price must be 0 or more"),
  current_stock: z.coerce
    .number({ invalid_type_error: "Current stock must be a number" })
    .int()
    .min(0)
    .optional()
    .default(0),
  min_threshold: z
    .union([z.literal(""), z.coerce.number().int().min(0)])
    .optional()
    .default(""),
  image_url: z.string().trim().optional().default(""),
  is_active: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .default("true")
    .transform((value) => value !== "false" && value !== "0" && value !== "no"),
});

export type ProductCsvRow = z.infer<typeof productCsvRowSchema>;

export function splitTags(cell: string): string[] {
  return Array.from(
    new Set(
      cell
        .split(/[;|]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

export { truthy };
