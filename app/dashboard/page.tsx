import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { resolveActiveStoreId } from "@/lib/store/resolve-active-store";
import { getRangeBounds } from "@/lib/reports/timezone";
import { mapSaleLineRows, type SaleLineJoinRow } from "@/lib/reports/shape";
import { buildSalesVelocity } from "@/lib/reports/aggregate";
import { resolveDashboardLayout } from "@/lib/dashboard/resolve-layout";
import { HomeDashboard } from "@/components/dashboard/home/HomeDashboard";
import type { OrderRow } from "@/lib/orders/types";
import type { Category, Product } from "@/lib/types/domain";
import type { ReportsSaleTouch, StockMovementRow } from "@/lib/reports/types";

const DEAD_STOCK_LOOKBACK_DAYS = 90;

export const dynamic = "force-dynamic";

const RECENT_ORDER_COLUMNS =
  "id, invoice_number, total, status, payment_method, is_offline_sync, created_at, cashier:profiles(full_name, email)";

export default async function DashboardPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, store_id, full_name")
    .eq("id", userResult.user.id)
    .single();

  const storeId = profile
    ? await resolveActiveStoreId(supabase, cookieStore.get(ACTIVE_STORE_COOKIE)?.value, profile)
    : null;
  if (!storeId) {
    redirect("/login");
  }

  const { data: store } = await supabase
    .from("stores")
    .select("name, timezone")
    .eq("id", storeId)
    .single();
  const timezone = store?.timezone ?? "UTC";

  const { from: todayFrom, to: todayTo } = getRangeBounds("today", timezone);
  const { from: weekFrom, to: weekTo } = getRangeBounds("7d", timezone);
  const { from: thirtyFrom, to: thirtyTo } = getRangeBounds("30d", timezone);
  const ninetyFrom = new Date(todayTo.getTime() - DEAD_STOCK_LOOKBACK_DAYS * 86_400_000);

  const [
    { data: categoryRows },
    { data: productRows },
    { data: weekSaleLineRows },
    { data: recentOrderRows },
    { data: thirtyDayItemRows },
    { data: ninetyDayTouchRows },
    { data: todayShrinkageRows },
    resolvedLayout,
  ] = await Promise.all([
    supabase
      .from("categories")
      .select("id, store_id, parent_id, name, slug, icon, sort_order, default_min_threshold, is_tax_exempt, created_at")
      .eq("store_id", storeId),
    supabase
      .from("products")
      .select("id, store_id, category_id, sku, barcode, name, description, tags, cost_price, retail_price, current_stock, min_threshold, image_url, is_active, updated_at")
      .eq("store_id", storeId),
    supabase
      .from("order_items")
      .select(
        "order_id, quantity, refunded_quantity, unit_price, product:products(id, name, sku, category_id, cost_price), order:orders!inner(created_at, invoice_number, status, store_id, payment_method, cashier:profiles(full_name, email))"
      )
      .eq("order.store_id", storeId)
      .neq("order.status", "voided")
      .gte("order.created_at", weekFrom.toISOString())
      .lte("order.created_at", weekTo.toISOString()),
    supabase
      .from("orders")
      .select(RECENT_ORDER_COLUMNS)
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
      .limit(6),
    // Lightweight — no product/cashier joins — this only feeds the reorder
    // suggestion's units-per-day calculation, not display.
    supabase
      .from("order_items")
      .select("product_id, quantity, refunded_quantity, order:orders!inner(created_at, status, store_id)")
      .eq("order.store_id", storeId)
      .neq("order.status", "voided")
      .gte("order.created_at", thirtyFrom.toISOString())
      .lte("order.created_at", thirtyTo.toISOString()),
    // Feeds the "Dead Stock Monitor" widget — a longer lookback than the
    // 45-day dead-stock cutoff so a product's actual last-sale date is known
    // rather than just "no sale in this window".
    supabase
      .from("order_items")
      .select("product_id, quantity, refunded_quantity, order:orders!inner(created_at, status, store_id)")
      .eq("order.store_id", storeId)
      .neq("order.status", "voided")
      .gte("order.created_at", ninetyFrom.toISOString()),
    // Feeds the "Shrinkage" KPI — today's shrinkage/offline-variance
    // inventory_logs entries, priced at cost.
    supabase
      .from("inventory_logs")
      .select("change_type, quantity, product:products(cost_price)")
      .eq("store_id", storeId)
      .in("change_type", ["shrinkage", "offline_variance"])
      .gte("created_at", todayFrom.toISOString()),
    resolveDashboardLayout(supabase, storeId),
  ]);

  const categories = (categoryRows ?? []) as Category[];
  const products = (productRows ?? []) as Product[];
  const weekSalesLines = mapSaleLineRows((weekSaleLineRows ?? []) as unknown as SaleLineJoinRow[]);
  const todaySalesLines = weekSalesLines.filter((line) => new Date(line.created_at) >= todayFrom);
  const recentOrders = (recentOrderRows ?? []) as unknown as Pick<
    OrderRow,
    "id" | "invoice_number" | "total" | "status" | "payment_method" | "is_offline_sync" | "created_at" | "cashier"
  >[];

  const thirtyDayWindowDays = Math.max(
    1,
    Math.round((thirtyTo.getTime() - thirtyFrom.getTime()) / 86_400_000)
  );
  const velocityByProductId = Object.fromEntries(
    buildSalesVelocity(
      (thirtyDayItemRows ?? []) as { product_id: string; quantity: number; refunded_quantity: number }[],
      thirtyDayWindowDays
    )
  );

  interface RawItemRow {
    product_id: string;
    quantity: number;
    refunded_quantity: number;
    order: { created_at: string };
  }
  const saleTouches: ReportsSaleTouch[] = ((ninetyDayTouchRows ?? []) as unknown as RawItemRow[]).map((row) => ({
    product_id: row.product_id,
    created_at: row.order.created_at,
    net_quantity: Math.max(0, row.quantity - row.refunded_quantity),
  }));

  const stockMovements = ((todayShrinkageRows ?? []) as unknown as {
    change_type: string;
    quantity: number;
    product: { cost_price: number } | null;
  }[]).map((row) => ({
    id: "",
    created_at: "",
    change_type: row.change_type,
    quantity: row.quantity,
    previous_stock: 0,
    new_stock: 0,
    notes: null,
    product_name: "",
    product_sku: "",
    cost_price: row.product?.cost_price ?? 0,
  })) satisfies StockMovementRow[];

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">
          {store?.name ? `${store.name} overview` : "Dashboard"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {profile?.full_name ? `Welcome back, ${profile.full_name.split(" ")[0]}.` : "Welcome back."}{" "}
          Here&apos;s how the store is doing right now.
        </p>
      </div>

      <HomeDashboard
        categories={categories}
        products={products}
        todaySalesLines={todaySalesLines}
        weekSalesLines={weekSalesLines}
        recentOrders={recentOrders}
        timezone={timezone}
        velocityByProductId={velocityByProductId}
        saleTouches={saleTouches}
        stockMovements={stockMovements}
        layoutConfig={resolvedLayout.layoutConfig}
        themeConfig={resolvedLayout.themeConfig}
      />
    </div>
  );
}
