import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { resolveActiveStoreId } from "@/lib/store/resolve-active-store";
import { getOrdersRangeBounds, type OrdersRangePreset } from "@/lib/orders/range";
import { OrdersManager } from "@/components/dashboard/orders/OrdersManager";
import type { OrderRow } from "@/lib/orders/types";

export const dynamic = "force-dynamic";

const VALID_PRESETS = new Set(["today", "7d", "30d", "90d", "all"]);
const ORDER_COLUMNS =
  "id, store_id, invoice_number, cashier_id, currency, subtotal, tax, discount, total, payment_method, amount_tendered, change_due, payment_auth_code, card_brand, card_last_four, is_offline_sync, previous_order_hash, current_order_hash, status, created_at, cashier:profiles(id, full_name, email), order_items(id, product_id, quantity, unit_price, subtotal, refunded_quantity, product:products(id, name, sku))";

interface OrdersPageProps {
  searchParams: Promise<{ range?: string }>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const params = await searchParams;
  const range = (VALID_PRESETS.has(params.range ?? "") ? params.range : "30d") as OrdersRangePreset;

  const supabase = await createClient();
  const cookieStore = await cookies();

  const { data: userResult } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, store_id")
    .eq("id", userResult.user!.id)
    .single();

  const storeId = profile
    ? await resolveActiveStoreId(supabase, cookieStore.get(ACTIVE_STORE_COOKIE)?.value, profile)
    : null;
  if (!storeId) {
    redirect("/dashboard");
  }

  const { data: store } = await supabase
    .from("stores")
    .select("timezone")
    .eq("id", storeId)
    .single();

  const { from, to } = getOrdersRangeBounds(range, store?.timezone ?? "UTC");

  let query = supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("store_id", storeId)
    .lte("created_at", to.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);
  if (from) query = query.gte("created_at", from.toISOString());

  const { data: orders } = await query;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Orders & Returns</h1>
        <p className="text-sm text-muted-foreground">
          Search past sales, review line items, and process returns.
        </p>
      </div>

      <OrdersManager
        orders={(orders ?? []) as unknown as OrderRow[]}
        range={range}
        currentUserId={profile!.id}
      />
    </div>
  );
}
