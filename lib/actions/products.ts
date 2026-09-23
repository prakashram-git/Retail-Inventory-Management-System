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

  const { error } = await supabase.from("products").insert({
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
  });

  if (error) throw new Error(error.message);
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

export async function deleteProduct(id: string) {
  const { supabase, storeId } = await requireStoreContext();

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id)
    .eq("store_id", storeId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/inventory");
}
