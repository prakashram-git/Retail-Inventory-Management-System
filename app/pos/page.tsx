import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { PosTerminal } from "@/components/pos/PosTerminal";
import type { PosCategory, PosProduct } from "@/lib/pos/types";

export const dynamic = "force-dynamic";

const DEFAULT_TAX_RATE_PERCENT = 8;

export default async function PosPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const { data: userResult } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, store_id, full_name, email")
    .eq("id", userResult.user!.id)
    .single();

  const storeId =
    profile?.role === "super_admin"
      ? cookieStore.get(ACTIVE_STORE_COOKIE)?.value ?? profile.store_id
      : profile?.store_id;

  const [{ data: store }, { data: settings }, { data: categories }, { data: products }] =
    await Promise.all([
      supabase
        .from("stores")
        .select("name, unit_number, floor_number")
        .eq("id", storeId!)
        .single(),
      supabase
        .from("system_settings")
        .select("default_tax_rate")
        .eq("store_id", storeId!)
        .maybeSingle(),
      supabase
        .from("categories")
        .select("id, name, parent_id, is_tax_exempt, icon")
        .eq("store_id", storeId!)
        .order("sort_order")
        .order("name"),
      supabase
        .from("products")
        .select(
          "id, store_id, category_id, sku, barcode, name, retail_price, current_stock, image_url, is_active, category:categories(id, name, parent_id, is_tax_exempt, icon)"
        )
        .eq("store_id", storeId!)
        .eq("is_active", true)
        .order("name"),
    ]);

  return (
    <PosTerminal
      initialProducts={(products ?? []) as unknown as PosProduct[]}
      categories={(categories ?? []) as PosCategory[]}
      storeId={storeId!}
      cashierId={profile!.id}
      cashierName={profile?.full_name || profile?.email || "Cashier"}
      storeName={store?.name ?? "Store"}
      unitNumber={store?.unit_number ?? null}
      floorNumber={store?.floor_number ?? null}
      taxRatePercent={settings?.default_tax_rate ?? DEFAULT_TAX_RATE_PERCENT}
    />
  );
}
