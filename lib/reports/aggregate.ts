import { localDateKey, localHour } from "./timezone";
import type { PaymentMethod } from "@/lib/orders/types";
import type {
  ReportsCategory,
  ReportsProduct,
  ReportsSaleLine,
  ReportsSaleTouch,
  StockMovementRow,
} from "./types";

/** Stock movements that represent a loss rather than a routine restock or sale. */
const SHRINKAGE_CHANGE_TYPES = new Set(["shrinkage", "offline_variance"]);

const MAX_DONUT_SLICES = 6;
const DEAD_INVENTORY_DAYS = 45;

function netQuantity(line: Pick<ReportsSaleLine, "quantity" | "refunded_quantity">) {
  return Math.max(0, line.quantity - line.refunded_quantity);
}

export interface CategoryRevenueSlice {
  categoryId: string | null;
  name: string;
  revenue: number;
  share: number;
}

/** Caps at MAX_DONUT_SLICES categories, folding the smallest remainder into "Other". */
export function buildCategoryRevenue(
  sales: ReportsSaleLine[],
  categories: ReportsCategory[]
): CategoryRevenueSlice[] {
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const revenueByCategory = new Map<string | null, number>();

  for (const line of sales) {
    const revenue = netQuantity(line) * line.unit_price;
    const key = line.category_id;
    revenueByCategory.set(key, (revenueByCategory.get(key) ?? 0) + revenue);
  }

  const rows = Array.from(revenueByCategory.entries())
    .map(([categoryId, revenue]) => ({
      categoryId,
      name: categoryId ? nameById.get(categoryId) ?? "Unknown category" : "Uncategorized",
      revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const total = rows.reduce((sum, r) => sum + r.revenue, 0);
  if (total <= 0) return [];

  const top = rows.slice(0, MAX_DONUT_SLICES);
  const rest = rows.slice(MAX_DONUT_SLICES);
  const otherRevenue = rest.reduce((sum, r) => sum + r.revenue, 0);

  const slices = otherRevenue > 0 ? [...top, { categoryId: null, name: "Other", revenue: otherRevenue }] : top;

  return slices.map((slice) => ({ ...slice, share: slice.revenue / total }));
}

export interface RevenueCogsPoint {
  bucket: string;
  label: string;
  revenue: number;
  cogs: number;
}

/** Buckets by local hour for the "today" preset, otherwise by local calendar day. */
export function buildRevenueVsCogsSeries(
  sales: ReportsSaleLine[],
  timeZone: string,
  granularity: "hour" | "day"
): RevenueCogsPoint[] {
  const points = new Map<string, RevenueCogsPoint>();

  for (const line of sales) {
    const date = new Date(line.created_at);
    const qty = netQuantity(line);
    if (qty <= 0) continue;

    const bucket =
      granularity === "hour"
        ? String(localHour(date, timeZone)).padStart(2, "0")
        : localDateKey(date, timeZone);
    const label =
      granularity === "hour"
        ? `${bucket}:00`
        : new Date(`${bucket}T00:00:00Z`).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });

    const existing = points.get(bucket) ?? { bucket, label, revenue: 0, cogs: 0 };
    existing.revenue += qty * line.unit_price;
    existing.cogs += qty * line.cost_price;
    points.set(bucket, existing);
  }

  return Array.from(points.values()).sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
}

export interface HourlyVelocityPoint {
  hour: number;
  label: string;
  revenue: number;
}

/** Total revenue per hour-of-day (store-local), summed across every day in the range. */
export function buildHourlyVelocity(sales: ReportsSaleLine[], timeZone: string): HourlyVelocityPoint[] {
  const revenueByHour = new Array<number>(24).fill(0);

  for (const line of sales) {
    const qty = netQuantity(line);
    if (qty <= 0) continue;
    const hour = localHour(new Date(line.created_at), timeZone);
    revenueByHour[hour] += qty * line.unit_price;
  }

  return revenueByHour.map((revenue, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    revenue,
  }));
}

export interface KpiSummary {
  grossRevenue: number;
  netProfit: number;
  orderCount: number;
  averageOrderValue: number;
  shrinkageValue: number;
}

/**
 * Gross revenue and net profit are net of refunds (line-level, via
 * netQuantity); AOV divides gross revenue by the count of distinct orders
 * that still have at least one net-positive line, so a fully-refunded
 * order doesn't count as a $0 sale dragging the average down. Shrinkage
 * value prices `shrinkage`/`offline_variance` inventory_logs entries at
 * cost, since that's the actual dollar loss to the business, not revenue.
 */
export function buildKpiSummary(
  sales: ReportsSaleLine[],
  stockMovements: StockMovementRow[]
): KpiSummary {
  let grossRevenue = 0;
  let netProfit = 0;
  const orderIds = new Set<string>();

  for (const line of sales) {
    const qty = netQuantity(line);
    if (qty <= 0) continue;
    grossRevenue += qty * line.unit_price;
    netProfit += qty * (line.unit_price - line.cost_price);
    orderIds.add(line.order_id);
  }

  const averageOrderValue = orderIds.size > 0 ? grossRevenue / orderIds.size : 0;

  const shrinkageValue = stockMovements
    .filter((row) => SHRINKAGE_CHANGE_TYPES.has(row.change_type))
    .reduce((sum, row) => sum + row.quantity * row.cost_price, 0);

  return { grossRevenue, netProfit, orderCount: orderIds.size, averageOrderValue, shrinkageValue };
}

export interface TopProductRow {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  revenue: number;
}

/** Best sellers by net revenue over whatever range `sales` already covers. */
export function buildTopProducts(sales: ReportsSaleLine[], limit = 5): TopProductRow[] {
  const byProduct = new Map<string, TopProductRow>();

  for (const line of sales) {
    const qty = netQuantity(line);
    if (qty <= 0 || !line.product_id) continue;

    const existing = byProduct.get(line.product_id) ?? {
      productId: line.product_id,
      name: line.product_name,
      sku: line.product_sku,
      quantity: 0,
      revenue: 0,
    };
    existing.quantity += qty;
    existing.revenue += qty * line.unit_price;
    byProduct.set(line.product_id, existing);
  }

  return Array.from(byProduct.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export interface PaymentBreakdownSlice {
  method: PaymentMethod;
  revenue: number;
  orders: number;
  share: number;
}

/** Net revenue and order count per tender type, for settlement reconciliation. */
export function buildPaymentBreakdown(sales: ReportsSaleLine[]): PaymentBreakdownSlice[] {
  const byMethod = new Map<PaymentMethod, { revenue: number; orderIds: Set<string> }>();

  for (const line of sales) {
    const qty = netQuantity(line);
    if (qty <= 0) continue;
    const entry = byMethod.get(line.payment_method) ?? { revenue: 0, orderIds: new Set<string>() };
    entry.revenue += qty * line.unit_price;
    entry.orderIds.add(line.order_id);
    byMethod.set(line.payment_method, entry);
  }

  const total = Array.from(byMethod.values()).reduce((sum, e) => sum + e.revenue, 0);

  return Array.from(byMethod.entries())
    .map(([method, entry]) => ({
      method,
      revenue: entry.revenue,
      orders: entry.orderIds.size,
      share: total > 0 ? entry.revenue / total : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export interface CashierPerformanceRow {
  cashierName: string;
  revenue: number;
  orders: number;
  averageOrderValue: number;
}

/** Net revenue, order count, and AOV per cashier — each order attributes to
 * whoever rang it up, from its (single) cashier_id. */
export function buildCashierPerformance(sales: ReportsSaleLine[]): CashierPerformanceRow[] {
  const byCashier = new Map<string, { revenue: number; orderIds: Set<string> }>();

  for (const line of sales) {
    const qty = netQuantity(line);
    if (qty <= 0) continue;
    const entry = byCashier.get(line.cashier_name) ?? { revenue: 0, orderIds: new Set<string>() };
    entry.revenue += qty * line.unit_price;
    entry.orderIds.add(line.order_id);
    byCashier.set(line.cashier_name, entry);
  }

  return Array.from(byCashier.entries())
    .map(([cashierName, entry]) => ({
      cashierName,
      revenue: entry.revenue,
      orders: entry.orderIds.size,
      averageOrderValue: entry.orderIds.size > 0 ? entry.revenue / entry.orderIds.size : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Percent change vs a previous-period value; null means "not computable"
 * (previous was zero but current isn't — an undefined percentage, not 0%). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export interface DeadInventoryRow {
  product: ReportsProduct;
  lastSaleAt: string | null;
  daysSinceSale: number | null;
  costTiedUp: number;
}

/** Active products with no net sale in the last 45 days (or never sold at all). */
export function buildDeadInventory(
  products: ReportsProduct[],
  touches: ReportsSaleTouch[],
  now: Date = new Date()
): DeadInventoryRow[] {
  const lastSaleByProduct = new Map<string, string>();
  for (const touch of touches) {
    if (touch.net_quantity <= 0) continue;
    const existing = lastSaleByProduct.get(touch.product_id);
    if (!existing || touch.created_at > existing) {
      lastSaleByProduct.set(touch.product_id, touch.created_at);
    }
  }

  const cutoff = now.getTime() - DEAD_INVENTORY_DAYS * 86_400_000;

  const rows: DeadInventoryRow[] = [];
  for (const product of products) {
    const lastSaleAt = lastSaleByProduct.get(product.id) ?? null;
    const lastSaleTime = lastSaleAt ? new Date(lastSaleAt).getTime() : null;
    if (lastSaleTime != null && lastSaleTime >= cutoff) continue;

    rows.push({
      product,
      lastSaleAt,
      daysSinceSale: lastSaleTime ? Math.floor((now.getTime() - lastSaleTime) / 86_400_000) : null,
      costTiedUp: product.current_stock * product.cost_price,
    });
  }

  return rows.sort((a, b) => b.costTiedUp - a.costTiedUp);
}
