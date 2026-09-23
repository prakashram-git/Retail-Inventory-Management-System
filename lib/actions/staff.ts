"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireSuperAdmin } from "./shared";
import { createAdminClient } from "@/lib/supabase/admin";

const roleSchema = z.enum(["super_admin", "store_manager", "cashier"]);

const inviteInputSchema = z
  .object({
    full_name: z.string().trim().min(1, "Name is required").max(120),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    role: roleSchema,
    store_id: z.string().uuid().nullable(),
    pos_pin: z
      .string()
      .trim()
      .regex(/^\d{4,6}$/, "PIN must be 4 to 6 digits"),
  })
  .refine((input) => input.role === "super_admin" || input.store_id !== null, {
    message: "Store managers and cashiers must be assigned to a store.",
    path: ["store_id"],
  });

export type InviteStaffInput = z.input<typeof inviteInputSchema>;

const assignmentInputSchema = z
  .object({
    role: roleSchema,
    store_id: z.string().uuid().nullable(),
  })
  .refine((input) => input.role === "super_admin" || input.store_id !== null, {
    message: "Store managers and cashiers must be assigned to a store.",
    path: ["store_id"],
  });

export type StaffAssignmentInput = z.input<typeof assignmentInputSchema>;

function generateTempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

/**
 * Creates the auth user via the service-role admin client (bypasses RLS,
 * required for cross-store account creation) with a generated temporary
 * password, since this project has no outbound email / auth callback route
 * to support a real magic-link invite flow. The password is returned once
 * for the admin to hand off directly, mirroring the existing email+password
 * demo-account login model.
 */
export async function inviteStaff(input: InviteStaffInput) {
  const parsed = inviteInputSchema.parse(input);
  await requireSuperAdmin();

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();
  const posPinHash = await bcrypt.hash(parsed.pos_pin, 10);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: parsed.full_name },
  });
  if (createError || !created.user) {
    throw new Error(createError?.message ?? "Failed to create the account.");
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: parsed.full_name,
    email: parsed.email,
    role: parsed.role,
    store_id: parsed.role === "super_admin" ? null : parsed.store_id,
    is_active: true,
    pos_pin_hash: posPinHash,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error(profileError.message);
  }

  revalidatePath("/dashboard/settings/users");
  return { email: parsed.email, tempPassword };
}

export async function updateStaffAssignment(id: string, input: StaffAssignmentInput) {
  const parsed = assignmentInputSchema.parse(input);
  const { supabase } = await requireSuperAdmin();

  const { error } = await supabase
    .from("profiles")
    .update({
      role: parsed.role,
      store_id: parsed.role === "super_admin" ? null : parsed.store_id,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/settings/users");
}

export async function setStaffActive(id: string, isActive: boolean) {
  const { supabase } = await requireSuperAdmin();

  const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/settings/users");
}
