import "server-only";
import type { ReportDefinition } from "../catalog";
import type { QueryRunnerParams, QueryRunnerResult, ReportSupabaseClient } from "../queryRunner";
import { localDateKey, localDayOfWeek, localHour } from "../timezone";

const SALE_LINE_COLUMNS =
  "order_id, quantity, refunded_quantity, unit_price, unit_cost, product:products(id, name, sku, category_id, categories:categories(id, name, parent_id)), order:orders!inner(id, invoice_number, created_at, status, store_id, discount, subtotal, tax, total, payment_method, is_offline_sync, cashier_id, cashier:profiles(full_name, email))";

interface SaleLineRow {
  order_id: string;
  quantity: number;
  refunded_quantity: number;
  unit_price: number;
  unit_cost: number;
  product: { id: string; name: string; sku: string; category_id: string | null; categories: { id: string; name: string; parent_id: string | null } | null } | null;
  order: {
    id: string;
    invoice_number: string;
    created_at: string;
    status: string;
    store_id: string;
    discount: number;
    subtotal: number;
    tax: number;
    total: number;
    payment_method: string;
    is_offline_sync: boolean;
    cashier_id: string;
    cashier: { full_name: string | null; email: string | null } | null;
  };
}

async function fetchSaleLines(
  supabase: ReportSupabaseClient,
  params: QueryRunnerParams
): Promise<SaleLineRow[]> {
  const query = supabase
    .from("order_items")
    .select(SALE_LINE_COLUMNS)
    .in("order.store_id", params.storeIds)
    .neq("order.status", "voided")
    .gte("order.created_at", params.startDate)
    .lte("order.created_at", params.endDate);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SaleLineRow[];
}

function netQty(row: SaleLineRow) {
  return Math.max(0, row.quantity - row.refunded_quantity);
}

function periodKey(dateStr: string, timezone: string, groupBy: string | undefined): string {
  const date = new Date(dateStr);
  if (groupBy === "month") return localDateKey(date, timezone).slice(0, 7);
  if (groupBy === "week") {
    const key = localDateKey(date, timezone);
    const d = new Date(`${key}T00:00:00Z`);
    const dayOfWeek = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - dayOfWeek);
    return d.toISOString().slice(0, 10);
  }
  return localDateKey(date, timezone);
}

export async function runSalesReport(
  supabase: ReportSupabaseClient,
  definition: ReportDefinition,
  params: QueryRunnerParams
): Promise<QueryRunnerResult> {
  switch (definition.id) {
    case "REP-SALES-01": {
      const lines = await fetchSaleLines(supabase, params);
      const byPeriod = new Map<
        string,
        { gross: number; discounts: Set<string>; discountTotal: number; returns: number; net: number; tax: Set<string>; taxTotal: number; cogs: number }
      >();
      for (const line of lines) {
        const key = periodKey(line.order.created_at, params.timezone, params.groupBy ?? "day");
        const qty = netQty(line);
        const entry = byPeriod.get(key) ?? {
          gross: 0,
          discounts: new Set<string>(),
          discountTotal: 0,
          returns: 0,
          net: 0,
          tax: new Set<string>(),
          taxTotal: 0,
          cogs: 0,
        };
        entry.gross += qty * line.unit_price;
        entry.returns += line.refunded_quantity * line.unit_price;
        entry.cogs += qty * line.unit_cost;
        if (!entry.discounts.has(line.order.id)) {
          entry.discounts.add(line.order.id);
          entry.discountTotal += line.order.discount;
        }
        if (!entry.tax.has(line.order.id)) {
          entry.tax.add(line.order.id);
          entry.taxTotal += line.order.tax;
          entry.net += line.order.total;
        }
        byPeriod.set(key, entry);
      }
      const rows = Array.from(byPeriod.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([period, e]) => ({
          period,
          gross_sales: round2(e.gross),
          discounts: round2(e.discountTotal),
          returns: round2(e.returns),
          net_sales: round2(e.net),
          tax_collected: round2(e.taxTotal),
          cogs: round2(e.cogs),
          gross_margin_pct: e.net > 0 ? round2(((e.net - e.cogs) / e.net) * 100) : 0,
        }));
      return { rows, totalRows: rows.length };
    }

    case "REP-SALES-02": {
      const lines = await fetchSaleLines(supabase, params);
      const byProduct = new Map<string, { sku: string; name: string; sold: number; returned: number; gross: number; net: number; cogs: number }>();
      for (const line of lines) {
        if (!line.product) continue;
        const entry = byProduct.get(line.product.id) ?? {
          sku: line.product.sku,
          name: line.product.name,
          sold: 0,
          returned: 0,
          gross: 0,
          net: 0,
          cogs: 0,
        };
        const qty = netQty(line);
        entry.sold += qty;
        entry.returned += line.refunded_quantity;
        entry.gross += line.quantity * line.unit_price;
        entry.net += qty * line.unit_price;
        entry.cogs += qty * line.unit_cost;
        byProduct.set(line.product.id, entry);
      }
      const rows = Array.from(byProduct.values())
        .sort((a, b) => b.net - a.net)
        .map((e) => ({
          sku: e.sku,
          product_name: e.name,
          units_sold: e.sold,
          units_returned: e.returned,
          gross_sales: round2(e.gross),
          net_sales: round2(e.net),
          cogs: round2(e.cogs),
          margin_pct: e.net > 0 ? round2(((e.net - e.cogs) / e.net) * 100) : 0,
        }));
      return { rows, totalRows: rows.length };
    }

    case "REP-SALES-03": {
      const lines = await fetchSaleLines(supabase, params);
      const byCategory = new Map<string, { name: string; parentName: string; sold: number; net: number; cogs: number }>();
      for (const line of lines) {
        const category = line.product?.categories;
        const key = category?.id ?? "uncategorized";
        const entry = byCategory.get(key) ?? {
          name: category?.name ?? "Uncategorized",
          parentName: "",
          sold: 0,
          net: 0,
          cogs: 0,
        };
        const qty = netQty(line);
        entry.sold += qty;
        entry.net += qty * line.unit_price;
        entry.cogs += qty * line.unit_cost;
        byCategory.set(key, entry);
      }
      const rows = Array.from(byCategory.values())
        .sort((a, b) => b.net - a.net)
        .map((e) => ({
          category_name: e.name,
          parent_category_name: e.parentName || "—",
          units_sold: e.sold,
          net_sales: round2(e.net),
          cogs: round2(e.cogs),
          margin_pct: e.net > 0 ? round2(((e.net - e.cogs) / e.net) * 100) : 0,
        }));
      return { rows, totalRows: rows.length };
    }

    case "REP-SALES-04": {
      const lines = await fetchSaleLines(supabase, params);
      const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const byCell = new Map<string, { day: number; hour: number; orders: Set<string>; revenue: number }>();
      for (const line of lines) {
        const date = new Date(line.order.created_at);
        const day = localDayOfWeek(date, params.timezone);
        const hour = localHour(date, params.timezone);
        const key = `${day}:${hour}`;
        const entry = byCell.get(key) ?? { day, hour, orders: new Set<string>(), revenue: 0 };
        entry.orders.add(line.order.id);
        entry.revenue += netQty(line) * line.unit_price;
        byCell.set(key, entry);
      }
      const rows = Array.from(byCell.values())
        .sort((a, b) => (a.day === b.day ? a.hour - b.hour : a.day - b.day))
        .map((e) => ({
          day_of_week: DAY_LABELS[e.day],
          hour: `${String(e.hour).padStart(2, "0")}:00`,
          order_count: e.orders.size,
          revenue: round2(e.revenue),
        }));
      return { rows, totalRows: rows.length };
    }

    case "REP-SALES-05": {
      const lines = await fetchSaleLines(supabase, params);
      const byOrder = new Map<
        string,
        { invoice: string; createdAt: string; units: number; skus: Set<string>; total: number }
      >();
      for (const line of lines) {
        const entry = byOrder.get(line.order.id) ?? {
          invoice: line.order.invoice_number,
          createdAt: line.order.created_at,
          units: 0,
          skus: new Set<string>(),
          total: line.order.total,
        };
        entry.units += netQty(line);
        if (line.product) entry.skus.add(line.product.sku);
        byOrder.set(line.order.id, entry);
      }
      const rows = Array.from(byOrder.values())
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((e) => ({
          invoice_number: e.invoice,
          created_at: e.createdAt,
          units: e.units,
          distinct_skus: e.skus.size,
          total: round2(e.total),
          is_multi_buy: e.skus.size >= 2 ? "Yes" : "No",
        }));
      return { rows, totalRows: rows.length };
    }

    case "REP-SALES-06": {
      const lines = await fetchSaleLines(supabase, params);
      const byChannel = new Map<string, { orders: Set<string>; net: number }>();
      for (const line of lines) {
        const channel = line.order.is_offline_sync ? "Offline (synced)" : "In-store POS";
        const entry = byChannel.get(channel) ?? { orders: new Set<string>(), net: 0 };
        if (!entry.orders.has(line.order.id)) {
          entry.orders.add(line.order.id);
          entry.net += line.order.total;
        }
        byChannel.set(channel, entry);
      }
      const total = Array.from(byChannel.values()).reduce((sum, e) => sum + e.net, 0);
      const rows = Array.from(byChannel.entries()).map(([channel, e]) => ({
        channel,
        order_count: e.orders.size,
        net_sales: round2(e.net),
        share_pct: total > 0 ? round2((e.net / total) * 100) : 0,
      }));
      return { rows, totalRows: rows.length };
    }

    default:
      throw new Error(`Unimplemented sales report: ${definition.id}`);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
