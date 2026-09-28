import { z } from "zod";

/** Loose but real validation — international formats vary too much for a strict
 * pattern, but this catches the "typed the name into the phone field" class
 * of mistake: at least 7 digits, only digits/space/+/-/()/. otherwise. */
const PHONE_PATTERN = /^[+\d][\d\s\-().]{5,}$/;

/**
 * Shared between the server actions (lib/actions/customers.ts) and any
 * client-side form (the POS quick-register panel, the dashboard customer
 * dialog) — same split-out-of-"use server" reasoning as lib/products/schema.ts.
 *
 * first_name/last_name split (not a single "full name" blob) matches every
 * leading retail POS/CRM's customer model (Shopify, Square, Lightspeed) —
 * needed for correct sorting/search by last name and so a receipt or export
 * doesn't have to guess how to split a name back apart. full_name itself is
 * a generated database column (customers_crm_fields.sql), never written
 * directly, so it isn't part of this input schema at all.
 */
const baseCustomerFormSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(80),
  last_name: z
    .string()
    .trim()
    .max(80)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
  phone: z
    .string()
    .trim()
    .max(32)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null))
    .refine((value) => !value || PHONE_PATTERN.test(value), {
      message: "Doesn't look like a phone number",
    }),
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
  company: z
    .string()
    .trim()
    .max(160)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
  // Explicit opt-in, defaulting closed — never assume consent for a contact
  // captured mid-transaction (same reasoning Shopify/Square's own "Email
  // marketing"/"SMS marketing" subscription toggles follow).
  accepts_email_marketing: z.boolean().default(false),
  accepts_sms_marketing: z.boolean().default(false),
});

export const customerFormSchema = baseCustomerFormSchema
  .refine((data) => !data.accepts_email_marketing || !!data.email, {
    message: "Add an email address before enabling email marketing",
    path: ["accepts_email_marketing"],
  })
  .refine((data) => !data.accepts_sms_marketing || !!data.phone, {
    message: "Add a phone number before enabling SMS marketing",
    path: ["accepts_sms_marketing"],
  });

export type CustomerFormInput = z.input<typeof customerFormSchema>;
export type CustomerFormValues = z.output<typeof customerFormSchema>;
