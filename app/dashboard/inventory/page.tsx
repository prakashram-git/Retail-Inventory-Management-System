import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { resolveActiveStoreId } from "@/lib/store/resolve-active-store";
import { InventoryDashboard } from "@/components/dashboard/inventory/InventoryDashboard";
import type { Category, ProductWithCategory } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
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

  const [{ data: categories }, { data: products }, { data: varianceOrders }] = await Promise.all([
    supabase
      .from("categories")
      .select(
        "id, store_id, parent_id, name, slug, icon, sort_order, default_min_threshold, is_tax_exempt, created_at"
      )
      .eq("store_id", storeId)
      .order("sort_order")
      .order("name"),
    supabase
      .from("products")
      .select(
        "*, category:categories(id, name, slug, parent_id, is_tax_exempt)"
      )
      .eq("store_id", storeId)
      // Variant parents are non-sellable containers; the variants themselves are listed.
      .eq("has_variants", false)
      .order("updated_at", { ascending: false }),
    supabase
      .from("orders")
      .select("id, invoice_number")
      .eq("store_id", storeId)
      .eq("status", "completed_with_stock_variance")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Products & Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Track stock, pricing, and margins across every SKU in this store.
        </p>
      </div>

      <InventoryDashboard
        products={(products ?? []) as ProductWithCategory[]}
        categories={(categories ?? []) as Category[]}
        varianceOrders={varianceOrders ?? []}
      />
    </div>
  );
}
