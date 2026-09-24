import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { resolveActiveStoreId } from "@/lib/store/resolve-active-store";
import { StockTakeScreen } from "@/components/dashboard/inventory/StockTakeScreen";
import type { Category, Product } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

export default async function StockTakePage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, store_id")
    .eq("id", userResult.user.id)
    .single();

  const storeId = profile
    ? await resolveActiveStoreId(supabase, cookieStore.get(ACTIVE_STORE_COOKIE)?.value, profile)
    : null;
  if (!storeId) redirect("/login");

  const [{ data: productRows }, { data: categoryRows }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, store_id, category_id, sku, barcode, name, description, tags, cost_price, retail_price, current_stock, min_threshold, image_url, is_active, updated_at"
      )
      .eq("store_id", storeId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("categories")
      .select("id, store_id, parent_id, name, slug, icon, sort_order, default_min_threshold, is_tax_exempt, created_at")
      .eq("store_id", storeId),
  ]);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <StockTakeScreen
        products={(productRows ?? []) as Product[]}
        categories={(categoryRows ?? []) as Category[]}
      />
    </div>
  );
}
