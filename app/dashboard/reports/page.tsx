import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { getRangeBounds, type ReportRangePreset } from "@/lib/reports/timezone";
import { ReportsDashboard } from "@/components/dashboard/reports/ReportsDashboard";
import type {
  ReportsCategory,
  ReportsProduct,
  ReportsSaleLine,
  ReportsSaleTouch,
  StockMovementRow,
  TillSessionRow,
} from "@/lib/reports/types";

export const dynamic = "force-dynamic";

const VALID_PRESETS = new Set(["today", "7d", "30d", "ytd"]);

interface ReportsPageProps {
  searchParams: Promise<{ range?: string }>;
}

interface SaleLineJoinRow {
  order_id: string;
  quantity: number;
  refunded_quantity: number;
  unit_price: number;
  product: { id: string; name: string; sku: string; category_id: string | null; cost_price: number } | null;
  order: { created_at: string; invoice_number: string };
}

interface SaleTouchJoinRow {
  product_id: string;
  quantity: number;
  refunded_quantity: number;
  order: { created_at: string };
}

interface StockMovementJoinRow {
  id: string;
  created_at: string;
  change_type: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  notes: string | null;
  product: { name: string; sku: string; cost_price: number } | null;
}

interface TillSessionJoinRow {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_float: number;
  closing_counted_cash: number | null;
  expected_cash: number | null;
  discrepancy: number | null;
  status: "open" | "closed";
  cashier: { full_name: string | null; email: string | null } | null;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const range = (VALID_PRESETS.has(params.range ?? "") ? params.range : "30d") as ReportRangePreset;

  const supabase = await createClient();
  const cookieStore = await cookies();

  const { data: userResult } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, store_id")
    .eq("id", userResult.user!.id)
    .single();

  const storeId =
    profile?.role === "super_admin"
      ? cookieStore.get(ACTIVE_STORE_COOKIE)?.value ?? profile.store_id
      : profile?.store_id;

  const { data: store } = await supabase
    .from("stores")
    .select("timezone")
    .eq("id", storeId!)
    .single();
  const timezone = store?.timezone ?? "UTC";

  const { from, to } = getRangeBounds(range, timezone);

  const [
    { data: categories },
    { data: saleLineRows },
    { data: products },
    { data: saleTouchRows },
    { data: stockMovementRows },
    { data: tillSessionRows },
  ] = await Promise.all([
    supabase.from("categories").select("id, name, parent_id").eq("store_id", storeId!),
    supabase
      .from("order_items")
      .select(
        "order_id, quantity, refunded_quantity, unit_price, product:products(id, name, sku, category_id, cost_price), order:orders!inner(created_at, invoice_number, status, store_id)"
      )
      .eq("order.store_id", storeId!)
      .neq("order.status", "voided")
      .gte("order.created_at", from.toISOString())
      .lte("order.created_at", to.toISOString()),
    supabase
      .from("products")
      .select("id, name, sku, category_id, current_stock, cost_price")
      .eq("store_id", storeId!)
      .eq("is_active", true),
    supabase
      .from("order_items")
      .select("product_id, quantity, refunded_quantity, order:orders!inner(created_at, status, store_id)")
      .eq("order.store_id", storeId!)
      .neq("order.status", "voided"),
    supabase
      .from("inventory_logs")
      .select(
        "id, created_at, change_type, quantity, previous_stock, new_stock, notes, product:products(name, sku, cost_price)"
      )
      .eq("store_id", storeId!)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("cash_drawer_sessions")
      .select(
        "id, opened_at, closed_at, opening_float, closing_counted_cash, expected_cash, discrepancy, status, cashier:profiles(full_name, email)"
      )
      .eq("store_id", storeId!)
      .gte("opened_at", from.toISOString())
      .lte("opened_at", to.toISOString())
      .order("opened_at", { ascending: false })
      .limit(200),
  ]);

  const salesLines: ReportsSaleLine[] = ((saleLineRows ?? []) as unknown as SaleLineJoinRow[]).map(
    (row) => ({
      order_id: row.order_id,
      invoice_number: row.order.invoice_number,
      created_at: row.order.created_at,
      product_id: row.product?.id ?? "",
      product_name: row.product?.name ?? "Unknown product",
      product_sku: row.product?.sku ?? "",
      category_id: row.product?.category_id ?? null,
      quantity: row.quantity,
      refunded_quantity: row.refunded_quantity,
      unit_price: row.unit_price,
      cost_price: row.product?.cost_price ?? 0,
    })
  );

  const saleTouches: ReportsSaleTouch[] = ((saleTouchRows ?? []) as unknown as SaleTouchJoinRow[]).map(
    (row) => ({
      product_id: row.product_id,
      created_at: row.order.created_at,
      net_quantity: row.quantity - row.refunded_quantity,
    })
  );

  const stockMovements: StockMovementRow[] = ((stockMovementRows ?? []) as unknown as StockMovementJoinRow[]).map(
    (row) => ({
      id: row.id,
      created_at: row.created_at,
      change_type: row.change_type,
      quantity: row.quantity,
      previous_stock: row.previous_stock,
      new_stock: row.new_stock,
      notes: row.notes,
      product_name: row.product?.name ?? "Unknown product",
      product_sku: row.product?.sku ?? "",
      cost_price: row.product?.cost_price ?? 0,
    })
  );

  const tillSessions: TillSessionRow[] = ((tillSessionRows ?? []) as unknown as TillSessionJoinRow[]).map(
    (row) => ({
      id: row.id,
      cashier_name: row.cashier?.full_name ?? row.cashier?.email ?? "Unknown cashier",
      opened_at: row.opened_at,
      closed_at: row.closed_at,
      opening_float: row.opening_float,
      closing_counted_cash: row.closing_counted_cash,
      expected_cash: row.expected_cash,
      discrepancy: row.discrepancy,
      status: row.status,
    })
  );

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Category performance, revenue trends, and stock health for this store.
        </p>
      </div>

      <ReportsDashboard
        salesLines={salesLines}
        categories={(categories ?? []) as ReportsCategory[]}
        products={(products ?? []) as ReportsProduct[]}
        saleTouches={saleTouches}
        stockMovements={stockMovements}
        tillSessions={tillSessions}
        range={range}
        timezone={timezone}
      />
    </div>
  );
}
