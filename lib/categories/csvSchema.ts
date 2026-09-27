import { z } from "zod";

/**
 * Column order for the downloadable template and for parseCsv's header
 * mapping — keep public/templates/categories-import-template.csv in sync.
 */
export const CATEGORY_CSV_COLUMNS = [
  "name",
  "parent_name",
  "icon",
  "default_min_threshold",
  "is_tax_exempt",
] as const;

export const categoryCsvRowSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  parent_name: z.string().trim().optional().default(""),
  icon: z.string().trim().optional().default("Package").transform((v) => v || "Package"),
  default_min_threshold: z.coerce
    .number({ invalid_type_error: "Default min threshold must be a number" })
    .int()
    .min(0)
    .max(100000)
    .optional()
    .default(5),
  is_tax_exempt: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .default("false")
    .transform((value) => value === "true" || value === "1" || value === "yes"),
});

export type CategoryCsvRow = z.infer<typeof categoryCsvRowSchema>;
