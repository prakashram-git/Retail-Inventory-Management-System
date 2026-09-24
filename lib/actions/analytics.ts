"use server";

import { requireStoreContext } from "./shared";
import { localHour, localDayOfWeek, getRangeBounds } from "@/lib/reports/timezone";
import { mapSaleLineRows, type SaleLineJoinRow } from "@/lib/reports/shape";
import { buildKpiSummary } from "@/lib/reports/aggregate";
import type {
  ExecutiveDigest,
  ExecutiveDigestDaily,
  CashierPerformanceRow,
  InventoryHealthMetrics,
  HeatmapCell,
} from "@/lib/analytics/types";

const SALE_LINE_COLUMNS =
  "order_id, quantity, refunded_quantity, unit_price, unit_cost, product:products(id, name, sku, category_id), order:orders!inner(created_at, invoice_number, status, store_id, payment_method, cashier:profiles(full_name, email))";

/**
 * "Last 30 Days" isn't one of get_daily_monthly_digest's two windows (daily,
 * MTD) — rather than add a fourth RPC for a single extra tab, this reuses
 * the same JS aggregation (buildKpiSummary) the Reports page already relies
 * on, over a rolling 30-day query.
 */
export async function getWindowDigest(days: 30): Promise<ExecutiveDigestDaily> {
  const { supabase, storeId } = await requireStoreContext();
  const { data: store } = await supabase.from("stores").select("timezone").eq("id", storeId).single();
  const timezone = store?.timezone ?? "UTC";
  const { from, to } = getRangeBounds(days === 30 ? "30d" : "today", timezone);

  const [{ data: rows, error }, { data: orderRows, error: orderError }] = await Promise.all([
    supabase
      .from("order_items")
      .select(SALE_LINE_COLUMNS)
      .eq("order.store_id", storeId)
      .neq("order.status", "voided")
      .gte("order.created_at", from.toISOString())
      .lte("order.created_at", to.toISOString()),
    supabase
      .from("orders")
      .select("discount, tax")
      .eq("store_id", storeId)
      .neq("status", "voided")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString()),
  ]);
  if (error) throw new Error(error.message);
  if (orderError) throw new Error(orderError.message);

  const lines = mapSaleLineRows((rows ?? []) as unknown as SaleLineJoinRow[]);
  const kpis = buildKpiSummary(lines, []);

  const totalUnits = lines.reduce((sum, l) => sum + Math.max(0, l.quantity - l.refunded_quantity), 0);
  const grossSales = lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);
  const discountTotal = (orderRows ?? []).reduce((sum, o) => sum + (o.discount ?? 0), 0);
  const taxCollected = (orderRows ?? []).reduce((sum, o) => sum + (o.tax ?? 0), 0);

  return {
    gross_sales: Math.round(grossSales * 100) / 100,
    net_sales: Math.round(kpis.grossRevenue * 100) / 100,
    order_count: kpis.orderCount,
    aov: Math.round((kpis.averageOrderValue ?? 0) * 100) / 100,
    upt: kpis.orderCount > 0 ? Math.round((totalUnits / kpis.orderCount) * 100) / 100 : 0,
    cogs: Math.round((kpis.grossRevenue - kpis.netProfit) * 100) / 100,
    gross_profit: Math.round(kpis.netProfit * 100) / 100,
    gross_margin_pct:
      kpis.grossRevenue > 0 ? Math.round((kpis.netProfit / kpis.grossRevenue) * 10000) / 100 : 0,
    discount_total: Math.round(discountTotal * 100) / 100,
    discount_leakage_pct: grossSales > 0 ? Math.round((discountTotal / grossSales) * 10000) / 100 : 0,
    tax_collected: Math.round(taxCollected * 100) / 100,
    dod_delta_pct: 0,
    wow_delta_pct: 0,
  };
}

/** Today's/MTD executive digest, timezone-resolved server-side by the RPC itself. */
export async function getExecutiveDigest(targetDate: string): Promise<ExecutiveDigest> {
  const { supabase, storeId } = await requireStoreContext();
  const { data, error } = await supabase.rpc("get_daily_monthly_digest", {
    p_store_id: storeId,
    p_target_date: targetDate,
  });
  if (error) throw new Error(error.message);
  return data as ExecutiveDigest;
}

export async function getCashierPerformance(
  startDate: string,
  endDate: string
): Promise<CashierPerformanceRow[]> {
  const { supabase, storeId } = await requireStoreContext();
  const { data, error } = await supabase.rpc("get_cashier_performance_metrics", {
    p_store_id: storeId,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: CashierPerformanceRow) => ({
    ...row,
    total_sales_volume: Number(row.total_sales_volume),
    total_hours_worked: Number(row.total_hours_worked),
    splh: Number(row.splh),
    average_ticket_size: Number(row.average_ticket_size),
    items_per_transaction: Number(row.items_per_transaction),
    discount_frequency_rate: Number(row.discount_frequency_rate),
    refund_amount: Number(row.refund_amount),
    net_drawer_discrepancy: Number(row.net_drawer_discrepancy),
  }));
}

export async function getInventoryHealth(): Promise<InventoryHealthMetrics> {
  const { supabase, storeId } = await requireStoreContext();
  const { data, error } = await supabase.rpc("get_inventory_health_metrics", {
    p_store_id: storeId,
  });
  if (error) throw new Error(error.message);
  return data as InventoryHealthMetrics;
}

const OPERATING_HOURS_START = 8; // 08:00 local
const OPERATING_HOURS_END = 22; // exclusive — 14 operating hours (08:00-21:59)

/**
 * A 7 (day-of-week) x 14 (operating hour) grid of order counts/revenue over
 * the trailing `weeksBack` weeks, bucketed by the store's local time — not
 * covered by any of the three analytical RPCs, so computed here directly
 * from a lightweight orders query using the same timezone-conversion
 * helpers the rest of the reports module already relies on.
 */
export async function getHourlySalesHeatmap(weeksBack = 8): Promise<{
  cells: HeatmapCell[];
  operatingHours: { start: number; end: number };
}> {
  const { supabase, storeId } = await requireStoreContext();

  const { data: store } = await supabase.from("stores").select("timezone").eq("id", storeId).single();
  const timezone = store?.timezone ?? "UTC";

  const from = new Date(Date.now() - weeksBack * 7 * 86_400_000);
  const { data: orders, error } = await supabase
    .from("orders")
    .select("created_at, total")
    .eq("store_id", storeId)
    .neq("status", "voided")
    .gte("created_at", from.toISOString());
  if (error) throw new Error(error.message);

  const grid = new Map<string, HeatmapCell>();
  for (let day = 0; day < 7; day++) {
    for (let hour = OPERATING_HOURS_START; hour < OPERATING_HOURS_END; hour++) {
      grid.set(`${day}:${hour}`, { day, hour, orderCount: 0, revenue: 0 });
    }
  }

  for (const order of orders ?? []) {
    const created = new Date(order.created_at);
    const day = localDayOfWeek(created, timezone);
    const hour = localHour(created, timezone);
    if (hour < OPERATING_HOURS_START || hour >= OPERATING_HOURS_END) continue;
    const cell = grid.get(`${day}:${hour}`);
    if (!cell) continue;
    cell.orderCount += 1;
    cell.revenue += order.total;
  }

  return {
    cells: Array.from(grid.values()),
    operatingHours: { start: OPERATING_HOURS_START, end: OPERATING_HOURS_END },
  };
}
