import { z } from "zod";

/**
 * Shared between the server actions (lib/actions/customers.ts) and any
 * client-side form (the POS quick-register panel, the dashboard customer
 * dialog) — same split-out-of-"use server" reasoning as lib/products/schema.ts.
 */
export const customerFormSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(160),
  phone: z
    .string()
    .trim()
    .max(32)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
  email: z
    .string()
    .trim()
    .max(255)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null))
    .refine((value) => !value || z.string().email().safeParse(value).success, {
      message: "Invalid email address",
    }),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
});

export type CustomerFormInput = z.input<typeof customerFormSchema>;
export type CustomerFormValues = z.output<typeof customerFormSchema>;
