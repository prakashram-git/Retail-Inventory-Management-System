import "server-only";
import type { ReportDefinition } from "../catalog";
import type { QueryRunnerParams, QueryRunnerResult, ReportSupabaseClient } from "../queryRunner";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function runAuditReport(
  supabase: ReportSupabaseClient,
  definition: ReportDefinition,
  params: QueryRunnerParams
): Promise<QueryRunnerResult> {
  switch (definition.id) {
    case "REP-AUD-01": {
      const { data, error } = await supabase
        .from("order_items")
        .select(
          "refunded_quantity, unit_price, product:products(sku, name), order:orders!inner(invoice_number, created_at, status, store_id, cashier:profiles(full_name, email))"
        )
        .in("order.store_id", params.storeIds)
        .gt("refunded_quantity", 0)
        .gte("order.created_at", params.startDate)
        .lte("order.created_at", params.endDate);
      if (error) throw new Error(error.message);

      type Row = {
        refunded_quantity: number;
        unit_price: number;
        product: { sku: string; name: string } | null;
        order: { invoice_number: string; created_at: string; cashier: { full_name: string | null; email: string | null } | null };
      };
      const rows = ((data ?? []) as unknown as Row[])
        .map((r) => ({
          invoice_number: r.order.invoice_number,
          sku: r.product?.sku ?? "",
          product_name: r.product?.name ?? "Unknown product",
          cashier_name: r.order.cashier?.full_name ?? r.order.cashier?.email ?? "Unknown",
          refunded_quantity: r.refunded_quantity,
          refund_amount: round2(r.refunded_quantity * r.unit_price),
        }))
        .sort((a, b) => b.refund_amount - a.refund_amount);
      return { rows, totalRows: rows.length };
    }

    case "REP-AUD-02": {
      const { data, error } = await supabase
        .from("orders")
        .select("invoice_number, created_at, subtotal, discount, cashier:profiles(full_name, email)")
        .in("store_id", params.storeIds)
        .neq("status", "voided")
        .gt("discount", 0)
        .gte("created_at", params.startDate)
        .lte("created_at", params.endDate)
        .order("discount", { ascending: false });
      if (error) throw new Error(error.message);
      const rows = ((data ?? []) as unknown as {
        invoice_number: string;
        created_at: string;
        subtotal: number;
        discount: number;
        cashier: { full_name: string | null; email: string | null } | null;
      }[]).map((o) => ({
        invoice_number: o.invoice_number,
        created_at: o.created_at,
        cashier_name: o.cashier?.full_name ?? o.cashier?.email ?? "Unknown",
        subtotal: round2(o.subtotal),
        discount: round2(o.discount),
        discount_pct: o.subtotal > 0 ? round2((o.discount / o.subtotal) * 100) : 0,
      }));
      return { rows, totalRows: rows.length };
    }

    case "REP-AUD-03": {
      const { data, error } = await supabase
        .from("orders")
        .select("invoice_number, created_at, total, cashier:profiles(full_name, email)")
        .in("store_id", params.storeIds)
        .eq("status", "voided")
        .gte("created_at", params.startDate)
        .lte("created_at", params.endDate)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      const rows = ((data ?? []) as unknown as {
        invoice_number: string;
        created_at: string;
        total: number;
        cashier: { full_name: string | null; email: string | null } | null;
      }[]).map((o) => ({
        invoice_number: o.invoice_number,
        created_at: o.created_at,
        cashier_name: o.cashier?.full_name ?? o.cashier?.email ?? "Unknown",
        total: round2(o.total),
      }));
      return { rows, totalRows: rows.length };
    }

    case "REP-AUD-04": {
      // Verified per store — the hash chain is a per-store sequence
      // (previous_order_hash links to the prior order *in that store*), so
      // interleaving stores by created_at before checking would produce
      // false "broken chain" results for a perfectly valid multi-store view.
      const { data, error } = await supabase
        .from("orders")
        .select("store_id, invoice_number, created_at, previous_order_hash, current_order_hash")
        .in("store_id", params.storeIds)
        .gte("created_at", params.startDate)
        .lte("created_at", params.endDate)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);

      type Row = {
        store_id: string;
        invoice_number: string;
        created_at: string;
        previous_order_hash: string | null;
        current_order_hash: string;
      };
      const byStore = new Map<string, Row[]>();
      for (const row of (data ?? []) as Row[]) {
        const list = byStore.get(row.store_id) ?? [];
        list.push(row);
        byStore.set(row.store_id, list);
      }

      const rows: Record<string, unknown>[] = [];
      for (const orders of byStore.values()) {
        let previousHash: string | null = null;
        for (const order of orders) {
          const chainStatus =
            previousHash === null
              ? "First order in range — no prior hash to verify"
              : order.previous_order_hash === previousHash
                ? "Verified"
                : "BROKEN — hash mismatch";
          rows.push({
            invoice_number: order.invoice_number,
            created_at: order.created_at,
            current_order_hash: order.current_order_hash,
            chain_status: chainStatus,
          });
          previousHash = order.current_order_hash;
        }
      }
      return { rows, totalRows: rows.length };
    }

    default:
      throw new Error(`Unimplemented audit report: ${definition.id}`);
  }
}
