"use server";

import { revalidatePath } from "next/cache";
import { requireStoreContext } from "./shared";
import { productFormSchema, type ProductFormInput } from "@/lib/products/schema";
import type { SupabaseClient } from "@supabase/supabase-js";

const productInputSchema = productFormSchema;

export type ProductInput = ProductFormInput;

async function assertSkuIsFree(
  supabase: SupabaseClient,
  storeId: string,
  sku: string,
  excludeId?: string
) {
  let query = supabase
    .from("products")
    .select("id")
    .eq("store_id", storeId)
    .eq("sku", sku)
    .limit(1);
  if (excludeId) query = query.neq("id", excludeId);

  const { data } = await query;
  if (data && data.length > 0) {
    throw new Error(`SKU "${sku}" is already used by another product in this store.`);
  }
}

async function assertBarcodeIsFree(
  supabase: SupabaseClient,
  storeId: string,
  barcode: string | null,
  excludeId?: string
) {
  if (!barcode) return;

  let query = supabase
    .from("products")
    .select("id")
    .eq("store_id", storeId)
    .eq("barcode", barcode)
    .limit(1);
  if (excludeId) query = query.neq("id", excludeId);

  const { data } = await query;
  if (data && data.length > 0) {
    throw new Error(`Barcode "${barcode}" is already used by another product in this store.`);
  }
}

export async function createProduct(input: ProductInput) {
  const parsed = productInputSchema.parse(input);
  const { supabase, storeId } = await requireStoreContext();

  await assertSkuIsFree(supabase, storeId, parsed.sku);
  await assertBarcodeIsFree(supabase, storeId, parsed.barcode);

  const { data: userResult } = await supabase.auth.getUser();

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      store_id: storeId,
      category_id: parsed.category_id,
      sku: parsed.sku,
      barcode: parsed.barcode,
      name: parsed.name,
      description: parsed.description,
      tags: parsed.tags,
      cost_price: parsed.cost_price,
      retail_price: parsed.retail_price,
      current_stock: parsed.current_stock,
      min_threshold: parsed.min_threshold,
      image_url: parsed.image_url,
      is_active: parsed.is_active,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  // A non-zero starting stock is a receiving event, same as any other
  // restock — it needs the same audit trail so "how did this product get
  // its stock" is always answerable from inventory_logs alone.
  if (parsed.current_stock > 0) {
    const { error: logError } = await supabase.from("inventory_logs").insert({
      store_id: storeId,
      product_id: product.id,
      change_type: "restock",
      quantity: parsed.current_stock,
      previous_stock: 0,
      new_stock: parsed.current_stock,
      notes: "Initial stock on product creation",
      created_by: userResult.user?.id,
    });
    if (logError) throw new Error(logError.message);
  }

  revalidatePath("/dashboard/inventory");
}

export async function updateProduct(id: string, input: ProductInput) {
  const parsed = productInputSchema.parse(input);
  const { supabase, storeId } = await requireStoreContext();

  await assertSkuIsFree(supabase, storeId, parsed.sku, id);
  await assertBarcodeIsFree(supabase, storeId, parsed.barcode, id);

  const { error } = await supabase
    .from("products")
    .update({
      category_id: parsed.category_id,
      sku: parsed.sku,
      barcode: parsed.barcode,
      name: parsed.name,
      description: parsed.description,
      tags: parsed.tags,
      cost_price: parsed.cost_price,
      retail_price: parsed.retail_price,
      current_stock: parsed.current_stock,
      min_threshold: parsed.min_threshold,
      image_url: parsed.image_url,
      is_active: parsed.is_active,
    })
    .eq("id", id)
    .eq("store_id", storeId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/inventory");
}

/**
 * A hard DELETE fails the moment a product has any history at all —
 * inventory_logs.product_id is a foreign key with no cascade, and the same
 * is true of order_items.product_id — so any product that's ever been
 * restocked, adjusted, or sold (which is effectively every real product,
 * and now every product from the moment it's created, since createProduct
 * logs the initial stock as a restock) can never be hard-deleted. Products
 * already have an `is_active` flag that the POS catalog and inventory
 * queries filter on, so "delete" is a deactivation: it disappears from the
 * catalog and can't be sold, but its audit trail and past orders stay
 * intact, and it can be reactivated later from the product sheet.
 */
export async function deleteProduct(id: string) {
  const { supabase, storeId } = await requireStoreContext();

  const { error } = await supabase
    .from("products")
    .update({ is_active: false })
    .eq("id", id)
    .eq("store_id", storeId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/inventory");
}
