import "server-only";
import type { ReportDefinition } from "../catalog";
import type { QueryRunnerParams, QueryRunnerResult, ReportSupabaseClient } from "../queryRunner";
import { getEffectiveThreshold, getStockStatus } from "@/lib/utils/inventory";
import type { Category, Product } from "@/lib/types/domain";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function fetchActiveProducts(supabase: ReportSupabaseClient, storeIds: string[]): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, store_id, category_id, sku, barcode, name, description, tags, cost_price, retail_price, current_stock, min_threshold, image_url, is_active, updated_at"
    )
    .in("store_id", storeIds)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as Product[];
}

export async function runInventoryReport(
  supabase: ReportSupabaseClient,
  definition: ReportDefinition,
  params: QueryRunnerParams
): Promise<QueryRunnerResult> {
  switch (definition.id) {
    case "REP-INV-01": {
      const products = await fetchActiveProducts(supabase, params.storeIds);
      const rows = products
        .map((p) => ({
          sku: p.sku,
          product_name: p.name,
          current_stock: p.current_stock,
          cost_value: round2(p.current_stock * p.cost_price),
          retail_value: round2(p.current_stock * p.retail_price),
          unrealized_margin: round2(p.current_stock * (p.retail_price - p.cost_price)),
        }))
        .sort((a, b) => b.retail_value - a.retail_value);
      return { rows, totalRows: rows.length };
    }

    case "REP-INV-02": {
      const [products, { data: categoryRows }] = await Promise.all([
        fetchActiveProducts(supabase, params.storeIds),
        supabase.from("categories").select("id, default_min_threshold").in("store_id", params.storeIds),
      ]);
      const categoryById = new Map(((categoryRows ?? []) as Category[]).map((c) => [c.id, c]));
      const rows = products
        .map((p) => {
          const threshold = getEffectiveThreshold(p, categoryById.get(p.category_id ?? ""));
          return { p, threshold, status: getStockStatus(p.current_stock, threshold) };
        })
        .filter((r) => r.status !== "healthy")
        .map(({ p, threshold }) => ({
          sku: p.sku,
          product_name: p.name,
          current_stock: p.current_stock,
          threshold,
          deficit: Math.max(0, threshold - p.current_stock),
          reorder_cost: round2(Math.max(0, threshold * 2 - p.current_stock) * p.cost_price),
        }))
        .sort((a, b) => a.current_stock - b.current_stock);
      return { rows, totalRows: rows.length };
    }

    case "REP-INV-03": {
      const products = await fetchActiveProducts(supabase, params.storeIds);
      const inStock = products.filter((p) => p.current_stock > 0);
      const { data: touchRows, error } = await supabase
        .from("order_items")
        .select("product_id, quantity, refunded_quantity, order:orders!inner(created_at, status, store_id)")
        .in("order.store_id", params.storeIds)
        .neq("order.status", "voided");
      if (error) throw new Error(error.message);

      const lastSaleByProduct = new Map<string, string>();
      for (const row of (touchRows ?? []) as unknown as {
        product_id: string;
        quantity: number;
        refunded_quantity: number;
        order: { created_at: string };
      }[]) {
        if (row.quantity - row.refunded_quantity <= 0) continue;
        const existing = lastSaleByProduct.get(row.product_id);
        if (!existing || row.order.created_at > existing) lastSaleByProduct.set(row.product_id, row.order.created_at);
      }

      const now = Date.now();
      const rows = inStock
        .map((p) => {
          const lastSale = lastSaleByProduct.get(p.id);
          const daysSince = lastSale ? Math.floor((now - new Date(lastSale).getTime()) / 86_400_000) : null;
          return { p, daysSince };
        })
        .filter((r) => r.daysSince === null || r.daysSince >= 30)
        .map(({ p, daysSince }) => {
          const days = daysSince ?? 9999;
          const bucket = days >= 90 ? "90+" : days >= 60 ? "60-89" : "30-59";
          return {
            sku: p.sku,
            product_name: p.name,
            current_stock: p.current_stock,
            days_since_sale: daysSince === null ? "Never sold" : days,
            bucket,
            capital_locked: round2(p.current_stock * p.cost_price),
          };
        })
        .sort((a, b) => b.capital_locked - a.capital_locked);
      return { rows, totalRows: rows.length };
    }

    case "REP-INV-04": {
      const products = await fetchActiveProducts(supabase, params.storeIds);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data: itemRows, error } = await supabase
        .from("order_items")
        .select("product_id, quantity, refunded_quantity, order:orders!inner(created_at, status, store_id)")
        .in("order.store_id", params.storeIds)
        .neq("order.status", "voided")
        .gte("order.created_at", thirtyDaysAgo);
      if (error) throw new Error(error.message);

      const soldByProduct = new Map<string, number>();
      for (const row of (itemRows ?? []) as unknown as { product_id: string; quantity: number; refunded_quantity: number }[]) {
        soldByProduct.set(row.product_id, (soldByProduct.get(row.product_id) ?? 0) + Math.max(0, row.quantity - row.refunded_quantity));
      }

      const rows = products
        .map((p) => {
          const sold = soldByProduct.get(p.id) ?? 0;
          const denominator = p.current_stock + sold;
          return {
            sku: p.sku,
            product_name: p.name,
            units_sold_30d: sold,
            current_stock: p.current_stock,
            sell_through_pct: denominator > 0 ? round2((sold / denominator) * 100) : 0,
          };
        })
        .sort((a, b) => b.sell_through_pct - a.sell_through_pct);
      return { rows, totalRows: rows.length };
    }

    case "REP-INV-05": {
      const { data, error } = await supabase
        .from("inventory_logs")
        .select("id, created_at, change_type, quantity, previous_stock, new_stock, notes, product:products(name, sku)")
        .in("store_id", params.storeIds)
        .gte("created_at", params.startDate)
        .lte("created_at", params.endDate)
        .order("created_at", { ascending: false })
        .limit(params.limit ?? 1000);
      if (error) throw new Error(error.message);
      const rows = ((data ?? []) as unknown as {
        id: string;
        created_at: string;
        change_type: string;
        quantity: number;
        previous_stock: number;
        new_stock: number;
        notes: string | null;
        product: { name: string; sku: string } | null;
      }[]).map((row) => ({
        created_at: row.created_at,
        sku: row.product?.sku ?? "",
        product_name: row.product?.name ?? "Unknown product",
        change_type: row.change_type,
        quantity: row.quantity,
        previous_stock: row.previous_stock,
        new_stock: row.new_stock,
        notes: row.notes ?? "",
      }));
      return { rows, totalRows: rows.length };
    }

    case "REP-INV-06": {
      const [products, { data: storeRows }] = await Promise.all([
        fetchActiveProducts(supabase, params.storeIds),
        supabase.from("stores").select("id, name").in("id", params.storeIds),
      ]);
      const storeNameById = new Map(((storeRows ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
      const rows = products
        .map((p) => ({
          sku: p.sku,
          product_name: p.name,
          store_name: storeNameById.get(p.store_id) ?? "Unknown store",
          current_stock: p.current_stock,
        }))
        .sort((a, b) => a.sku.localeCompare(b.sku) || a.store_name.localeCompare(b.store_name));
      return { rows, totalRows: rows.length };
    }

    default:
      throw new Error(`Unimplemented inventory report: ${definition.id}`);
  }
}
