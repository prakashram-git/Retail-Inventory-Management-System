import { z } from "zod";

/**
 * Shared between the server action (lib/actions/products.ts) and the
 * client-side react-hook-form resolver (ProductSheet.tsx) — a "use server"
 * file can only export async functions, so the schema itself has to live
 * outside it to be importable from a client component.
 */
export const productFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  sku: z.string().trim().min(1, "SKU is required").max(64),
  barcode: z
    .string()
    .trim()
    .max(64)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
  category_id: z.string().uuid().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
  cost_price: z.coerce.number().min(0, "Cost must be 0 or more"),
  retail_price: z.coerce.number().min(0, "Retail price must be 0 or more"),
  current_stock: z.coerce.number().int().min(0),
  min_threshold: z.coerce.number().int().min(0).nullable(),
  image_url: z
    .string()
    .trim()
    .url()
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
  is_active: z.boolean().default(true),
});

export type ProductFormInput = z.input<typeof productFormSchema>;
export type ProductFormValues = z.output<typeof productFormSchema>;
