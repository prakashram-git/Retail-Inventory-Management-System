import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { resolveActiveStoreId } from "@/lib/store/resolve-active-store";
import { CategoryManager } from "@/components/dashboard/categories/CategoryManager";
import type { CategoryWithCount } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const { data: userResult } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, store_id")
    .eq("id", userResult.user!.id)
    .single();

  const storeId = profile
    ? await resolveActiveStoreId(supabase, cookieStore.get(ACTIVE_STORE_COOKIE)?.value, profile)
    : null;
  if (!storeId) {
    redirect("/dashboard");
  }

  const [{ data: categories }, { data: productRows }] = await Promise.all([
    supabase
      .from("categories")
      .select(
        "id, store_id, parent_id, name, slug, icon, sort_order, default_min_threshold, is_tax_exempt, created_at"
      )
      .eq("store_id", storeId)
      .order("sort_order")
      .order("name"),
    supabase.from("products").select("category_id").eq("store_id", storeId),
  ]);

  const counts = new Map<string, number>();
  for (const row of productRows ?? []) {
    if (!row.category_id) continue;
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
  }

  const categoriesWithCount: CategoryWithCount[] = (categories ?? []).map((category) => ({
    ...category,
    product_count: counts.get(category.id) ?? 0,
  }));

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Categories</h1>
        <p className="text-sm text-muted-foreground">
          Organize your catalog into parent categories and subcategories.
        </p>
      </div>

      <CategoryManager categories={categoriesWithCount} />
    </div>
  );
}
