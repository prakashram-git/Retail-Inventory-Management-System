"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStoreContext } from "./shared";
import { getStoreEffectiveFeatures } from "@/lib/profiles/featureResolver";
import { slugify } from "@/lib/utils/slug";
import type { SupabaseClient } from "@supabase/supabase-js";

const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  parent_id: z.string().uuid().nullable(),
  icon: z.string().trim().min(1).max(40).default("Package"),
  default_min_threshold: z.coerce.number().int().min(0).max(100000),
  is_tax_exempt: z.boolean().default(false),
});

export type CategoryInput = z.input<typeof categoryInputSchema>;

/**
 * Appends a numeric suffix until the slug is free within the store. Scoped
 * by store_id (not globally) since two stores may legitimately both want
 * "menswear".
 */
async function uniqueSlug(
  supabase: SupabaseClient,
  storeId: string,
  name: string,
  excludeId?: string
): Promise<string> {
  const root = slugify(name) || "category";
  let candidate = root;
  let suffix = 1;

  while (true) {
    let query = supabase
      .from("categories")
      .select("id")
      .eq("store_id", storeId)
      .eq("slug", candidate);
    if (excludeId) query = query.neq("id", excludeId);

    const { data } = await query.maybeSingle();
    if (!data) return candidate;

    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
}

export async function createCategory(input: CategoryInput) {
  const parsed = categoryInputSchema.parse(input);
  const { supabase, storeId, role } = await requireStoreContext();

  if (role !== "super_admin") {
    const { allow_new_category } = await getStoreEffectiveFeatures(storeId);
    if (!allow_new_category) {
      throw new Error("Category creation is disabled on this store's profile.");
    }
  }

  if (parsed.parent_id) {
    const { data: parent } = await supabase
      .from("categories")
      .select("id")
      .eq("id", parsed.parent_id)
      .eq("store_id", storeId)
      .maybeSingle();
    if (!parent) throw new Error("Selected parent category was not found.");
  }

  const slug = await uniqueSlug(supabase, storeId, parsed.name);

  const { error } = await supabase.from("categories").insert({
    store_id: storeId,
    parent_id: parsed.parent_id,
    name: parsed.name,
    slug,
    icon: parsed.icon,
    default_min_threshold: parsed.default_min_threshold,
    is_tax_exempt: parsed.is_tax_exempt,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/categories");
}

export async function updateCategory(id: string, input: CategoryInput) {
  const parsed = categoryInputSchema.parse(input);
  const { supabase, storeId } = await requireStoreContext();

  if (parsed.parent_id === id) {
    throw new Error("A category cannot be its own parent.");
  }

  const { data: existing } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("id", id)
    .eq("store_id", storeId)
    .maybeSingle();
  if (!existing) throw new Error("Category not found.");

  if (parsed.parent_id) {
    const { data: parent } = await supabase
      .from("categories")
      .select("id")
      .eq("id", parsed.parent_id)
      .eq("store_id", storeId)
      .maybeSingle();
    if (!parent) throw new Error("Selected parent category was not found.");
  }

  const slug =
    existing.name === parsed.name
      ? existing.slug
      : await uniqueSlug(supabase, storeId, parsed.name, id);

  const { error } = await supabase
    .from("categories")
    .update({
      parent_id: parsed.parent_id,
      name: parsed.name,
      slug,
      icon: parsed.icon,
      default_min_threshold: parsed.default_min_threshold,
      is_tax_exempt: parsed.is_tax_exempt,
    })
    .eq("id", id)
    .eq("store_id", storeId);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/categories");
}

/**
 * Deletes a category, re-parenting its subcategories and re-assigning its
 * products to `reassignToId` first (or to "uncategorized" when omitted) so
 * neither is silently orphaned or cascade-deleted.
 */
export async function deleteCategory(id: string, reassignToId: string | null) {
  const { supabase, storeId } = await requireStoreContext();

  if (reassignToId === id) {
    throw new Error("Cannot reassign a category's contents to itself.");
  }

  if (reassignToId) {
    const { data: target } = await supabase
      .from("categories")
      .select("id")
      .eq("id", reassignToId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (!target) throw new Error("Reassignment target category was not found.");
  }

  const { error: reparentError } = await supabase
    .from("categories")
    .update({ parent_id: reassignToId })
    .eq("parent_id", id)
    .eq("store_id", storeId);
  if (reparentError) throw new Error(reparentError.message);

  const { error: reassignError } = await supabase
    .from("products")
    .update({ category_id: reassignToId })
    .eq("category_id", id)
    .eq("store_id", storeId);
  if (reassignError) throw new Error(reassignError.message);

  const { error: deleteError } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("store_id", storeId);
  if (deleteError) throw new Error(deleteError.message);

  revalidatePath("/dashboard/categories");
  revalidatePath("/dashboard/inventory");
}
