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

  const [{ data: store }, { data: settings }, { data: categories }, { data: products }, staffDirectoryResult] =
    await Promise.all([
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
    ]);

  const staffDirectory = (staffDirectoryResult.data ?? []).map((member: { id: string; full_name: string | null; email: string }) => ({
    id: member.id,
    name: member.full_name || member.email,
  }));

  return (
    <PosTerminal
      initialProducts={(products ?? []) as unknown as PosProduct[]}
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
      lockOnOrderComplete={settings?.lock_on_order_complete ?? true}
      lockOnDrawerClose={settings?.lock_on_drawer_close ?? true}
      staffDirectory={staffDirectory}
    />
  );
}
