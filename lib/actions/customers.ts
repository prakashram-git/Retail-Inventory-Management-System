"use server";

import { revalidatePath } from "next/cache";
import { customerFormSchema, type CustomerFormInput } from "@/lib/customers/schema";
import { requirePosStoreContext, requireStoreContext } from "./shared";

export interface CustomerSummary {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
}

/** Both customers_crm_fields.sql unique indexes name the colliding field, so the
 * Postgres error message itself tells us which one — no need to guess or re-query. */
function duplicateFieldError(error: { code?: string; message: string }): Error | null {
  if (error.code !== "23505") return null;
  if (error.message.includes("uq_customers_store_email_case_insensitive")) {
    return new Error("A customer with this email address already exists.");
  }
  if (error.message.includes("uq_customers_store_phone_case_insensitive")) {
    return new Error("A customer with this phone number already exists.");
  }
  return new Error("A customer with these details already exists.");
}

/** Cashier-reachable: used by the POS "Add customer" search-as-you-type panel. */
export async function searchCustomers(query: string): Promise<CustomerSummary[]> {
  const { supabase, storeId } = await requirePosStoreContext();
  // Strip characters that are syntactically meaningful in PostgREST's
  // .or() filter grammar (comma separates conditions, parens group them) —
  // this is a search term, not a place to let a client shape the filter.
  const trimmed = query.trim().replace(/[,()]/g, "");
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, phone, email")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .or(`full_name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%,email.ilike.%${trimmed}%`)
    .order("last_name")
    .order("first_name")
    .limit(10);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Cashier-reachable: registering a customer at the register is routine cashier work. */
export async function createCustomer(input: CustomerFormInput): Promise<CustomerSummary> {
  const parsed = customerFormSchema.parse(input);
  const { supabase, storeId } = await requirePosStoreContext();

  const { data, error } = await supabase
    .from("customers")
    .insert({ ...parsed, store_id: storeId })
    .select("id, full_name, phone, email")
    .single();

  if (error) {
    throw duplicateFieldError(error) ?? new Error(error.message);
  }

  revalidatePath("/dashboard/customers");
  return data;
}

/** Manager/admin only — matches customers_update RLS. */
export async function updateCustomer(id: string, input: CustomerFormInput) {
  const parsed = customerFormSchema.parse(input);
  const { supabase, storeId } = await requireStoreContext();

  const { error } = await supabase
    .from("customers")
    .update({ ...parsed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("store_id", storeId);

  if (error) {
    throw duplicateFieldError(error) ?? new Error(error.message);
  }

  revalidatePath("/dashboard/customers");
}

/** Soft delete only — a customer with order history can't be hard-deleted (orders.customer_id is ON DELETE RESTRICT). */
export async function deactivateCustomer(id: string) {
  const { supabase, storeId } = await requireStoreContext();

  const { error } = await supabase
    .from("customers")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("store_id", storeId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/customers");
}

export async function reactivateCustomer(id: string) {
  const { supabase, storeId } = await requireStoreContext();

  const { error } = await supabase
    .from("customers")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("store_id", storeId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/customers");
}
