import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { resolveActiveStoreId } from "@/lib/store/resolve-active-store";
import { PosTerminal } from "@/components/pos/PosTerminal";
import type { PosCategory, PosProduct } from "@/lib/pos/types";
import type { UserRole } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

const DEFAULT_TAX_RATE_PERCENT = 8;

export default async function PosPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const { data: userResult } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, store_id, full_name, email, phone")
    .eq("id", userResult.user!.id)
    .single();

  const storeId = profile
    ? await resolveActiveStoreId(supabase, cookieStore.get(ACTIVE_STORE_COOKIE)?.value, profile)
    : null;
  if (!storeId) {
    redirect("/dashboard");
  }
  const resolvedStoreId: string = storeId;

  const canManageOthersCarts = profile!.role === "super_admin" || profile!.role === "store_manager";
  const demandWindowEnd = new Date();
  const demandWindowStart = new Date(demandWindowEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    { data: store },
    { data: settings },
    { data: categories },
    { data: products },
    staffDirectoryResult,
    { data: salesItems },
  ] = await Promise.all([
      supabase
        .from("stores")
        .select("name, unit_number, floor_number")
        .eq("id", resolvedStoreId)
        .single(),
      supabase
        .from("system_settings")
        .select("default_tax_rate, inactivity_timeout_seconds, lock_on_order_complete, lock_on_drawer_close")
        .eq("store_id", resolvedStoreId)
        .maybeSingle(),
      supabase
        .from("categories")
        .select("id, name, parent_id, is_tax_exempt, icon")
        .eq("store_id", resolvedStoreId)
        .order("sort_order")
        .order("name"),
      supabase
        .from("products")
        .select(
          "id, store_id, category_id, sku, barcode, name, retail_price, current_stock, image_url, is_active, category:categories(id, name, parent_id, is_tax_exempt, icon)"
        )
        .eq("store_id", resolvedStoreId)
        .eq("is_active", true)
        // Variant parents are non-sellable containers; their child variants are the SKUs.
        .eq("has_variants", false)
        .order("name"),
      // Only fetched for a manager/admin — used solely to show whose parked
      // cart OrphanedCartPrompt is offering to claim/discard; cashiers never
      // see that prompt so they never need this list.
      canManageOthersCarts
        ? supabase.from("profiles").select("id, full_name, email").eq("store_id", resolvedStoreId)
        : Promise.resolve({ data: null }),
      supabase
        .from("order_items")
        .select("product_id, quantity, refunded_quantity, unit_price, order:orders!inner(store_id, created_at, status)")
        .eq("order.store_id", resolvedStoreId)
        .neq("order.status", "voided")
        .gte("order.created_at", demandWindowStart.toISOString())
        .lte("order.created_at", demandWindowEnd.toISOString()),
    ]);

  const availableProductIds = new Set((products ?? []).filter((product) => product.current_stock > 0).map((product) => product.id));
  const demandByProduct = new Map<string, { units: number; revenue: number }>();
  for (const item of salesItems ?? []) {
    const units = Math.max(0, Number(item.quantity) - Number(item.refunded_quantity));
    if (!item.product_id || units === 0) continue;
    const demand = demandByProduct.get(item.product_id) ?? { units: 0, revenue: 0 };
    demand.units += units;
    demand.revenue += units * Number(item.unit_price);
    demandByProduct.set(item.product_id, demand);
  }

  const popularProductIds = [...demandByProduct.entries()]
    .filter(([productId, demand]) => availableProductIds.has(productId) && demand.units > 0)
    .sort((a, b) => b[1].units - a[1].units || b[1].revenue - a[1].revenue)
    .slice(0, 12)
    .map(([productId]) => productId);

  const staffDirectory = (staffDirectoryResult.data ?? []).map((member: { id: string; full_name: string | null; email: string }) => ({
    id: member.id,
    name: member.full_name || member.email,
  }));

  return (
    <PosTerminal
      initialProducts={(products ?? []) as unknown as PosProduct[]}
      popularProductIds={popularProductIds}
      categories={(categories ?? []) as PosCategory[]}
      storeId={resolvedStoreId}
      role={profile!.role as UserRole}
      cashierId={profile!.id}
      cashierName={profile?.full_name || profile?.email || "Cashier"}
      cashierPhone={profile?.phone ?? null}
      storeName={store?.name ?? "Store"}
      unitNumber={store?.unit_number ?? null}
      floorNumber={store?.floor_number ?? null}
      taxRatePercent={settings?.default_tax_rate ?? DEFAULT_TAX_RATE_PERCENT}
      inactivityTimeoutSeconds={settings?.inactivity_timeout_seconds ?? 300}
      lockOnOrderComplete={settings?.lock_on_order_complete ?? false}
      lockOnDrawerClose={settings?.lock_on_drawer_close ?? true}
      staffDirectory={staffDirectory}
    />
  );
}
