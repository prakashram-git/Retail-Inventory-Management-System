import "server-only";
import type { ReportDefinition } from "../catalog";
import type { QueryRunnerParams, QueryRunnerResult, ReportSupabaseClient } from "../queryRunner";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function runFinanceReport(
  supabase: ReportSupabaseClient,
  definition: ReportDefinition,
  params: QueryRunnerParams
): Promise<QueryRunnerResult> {
  switch (definition.id) {
    case "REP-FIN-01":
    case "REP-FIN-04": {
      const { data, error } = await supabase
        .from("cash_drawer_sessions")
        .select(
          "id, opened_at, closed_at, opening_float, closing_counted_cash, expected_cash, discrepancy, status, notes, cashier:profiles(full_name, email)"
        )
        .in("store_id", params.storeIds)
        .gte("opened_at", params.startDate)
        .lte("opened_at", params.endDate)
        .order("opened_at", { ascending: false })
        .limit(params.limit ?? 500);
      if (error) throw new Error(error.message);

      type SessionRow = {
        opened_at: string;
        closed_at: string | null;
        opening_float: number;
        closing_counted_cash: number | null;
        expected_cash: number | null;
        discrepancy: number | null;
        status: string;
        notes: string | null;
        cashier: { full_name: string | null; email: string | null } | null;
      };
      const sessions = (data ?? []) as unknown as SessionRow[];

      if (definition.id === "REP-FIN-04") {
        const rows = sessions
          .filter((s) => (s.discrepancy ?? 0) !== 0)
          .map((s) => ({
            opened_at: s.opened_at,
            cashier_name: s.cashier?.full_name ?? s.cashier?.email ?? "Unknown",
            discrepancy: round2(s.discrepancy ?? 0),
            notes: s.notes ?? "",
          }));
        return { rows, totalRows: rows.length };
      }

      const rows = sessions.map((s) => ({
        cashier_name: s.cashier?.full_name ?? s.cashier?.email ?? "Unknown",
        opened_at: s.opened_at,
        closed_at: s.closed_at,
        opening_float: round2(s.opening_float),
        expected_cash: s.expected_cash != null ? round2(s.expected_cash) : null,
        closing_counted_cash: s.closing_counted_cash != null ? round2(s.closing_counted_cash) : null,
        discrepancy: s.discrepancy != null ? round2(s.discrepancy) : null,
        status: s.status,
      }));
      return { rows, totalRows: rows.length };
    }

    case "REP-FIN-02": {
      const { data, error } = await supabase
        .from("orders")
        .select("id, payment_method, total")
        .in("store_id", params.storeIds)
        .neq("status", "voided")
        .gte("created_at", params.startDate)
        .lte("created_at", params.endDate);
      if (error) throw new Error(error.message);

      const byMethod = new Map<string, { count: number; revenue: number }>();
      for (const order of (data ?? []) as { payment_method: string; total: number }[]) {
        const entry = byMethod.get(order.payment_method) ?? { count: 0, revenue: 0 };
        entry.count += 1;
        entry.revenue += order.total;
        byMethod.set(order.payment_method, entry);
      }
      const total = Array.from(byMethod.values()).reduce((sum, e) => sum + e.revenue, 0);
      const METHOD_LABEL: Record<string, string> = { cash: "Cash", card: "Card", qr_transfer: "QR Transfer" };
      const rows = Array.from(byMethod.entries())
        .map(([method, e]) => ({
          method: METHOD_LABEL[method] ?? method,
          order_count: e.count,
          revenue: round2(e.revenue),
          share_pct: total > 0 ? round2((e.revenue / total) * 100) : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);
      return { rows, totalRows: rows.length };
    }

    case "REP-FIN-03": {
      const { data, error } = await supabase
        .from("order_items")
        .select(
          "quantity, refunded_quantity, unit_price, product:products(category_id, categories:categories(is_tax_exempt)), order:orders!inner(created_at, status, store_id, tax, subtotal)"
        )
        .in("order.store_id", params.storeIds)
        .neq("order.status", "voided")
        .gte("order.created_at", params.startDate)
        .lte("order.created_at", params.endDate);
      if (error) throw new Error(error.message);

      type Row = {
        quantity: number;
        refunded_quantity: number;
        unit_price: number;
        product: { category_id: string | null; categories: { is_tax_exempt: boolean } | null } | null;
        order: { id?: string; tax: number; subtotal: number };
      };
      let taxableNet = 0;
      let exemptNet = 0;
      let taxCollected = 0;
      const seenOrders = new Set<string>();
      for (const row of (data ?? []) as unknown as (Row & { order: { id: string } & Row["order"] })[]) {
        const qty = Math.max(0, row.quantity - row.refunded_quantity);
        const net = qty * row.unit_price;
        if (row.product?.categories?.is_tax_exempt) exemptNet += net;
        else taxableNet += net;
        if (!seenOrders.has(row.order.id)) {
          seenOrders.add(row.order.id);
          taxCollected += row.order.tax;
        }
      }
      const rows = [
        { tax_status: "Taxable", net_sales: round2(taxableNet), tax_collected: round2(taxCollected) },
        { tax_status: "Tax-Exempt", net_sales: round2(exemptNet), tax_collected: 0 },
      ];
      return { rows, totalRows: rows.length };
    }

    default:
      throw new Error(`Unimplemented finance report: ${definition.id}`);
  }
}
