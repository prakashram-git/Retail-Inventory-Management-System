import "server-only";
import type { ReportDefinition } from "../catalog";
import type { QueryRunnerParams, QueryRunnerResult, ReportSupabaseClient } from "../queryRunner";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface CashierMetricRow {
  cashier_id: string;
  cashier_name: string;
  role: string;
  total_sales_volume: number;
  transaction_count: number;
  total_hours_worked: number;
  splh: number;
  average_ticket_size: number;
  total_units: number;
  items_per_transaction: number;
  discount_frequency_rate: number;
  void_count: number;
  refund_count: number;
  refund_amount: number;
  net_drawer_discrepancy: number;
  risk_score: string;
}

/**
 * get_cashier_performance_metrics() (supabase/analytics_rpcs.sql) is
 * single-store — it takes one p_store_id. For a mall-wide "all stores" view,
 * it's called once per store and the rows are merged; this is a handful of
 * cheap aggregate queries, not N+1 row-level fetches.
 */
async function fetchCashierMetrics(supabase: ReportSupabaseClient, params: QueryRunnerParams): Promise<CashierMetricRow[]> {
  const results = await Promise.all(
    params.storeIds.map((storeId) =>
      supabase.rpc("get_cashier_performance_metrics", {
        p_store_id: storeId,
        p_start_date: params.startDate,
        p_end_date: params.endDate,
      })
    )
  );
  const rows: CashierMetricRow[] = [];
  for (const { data, error } of results) {
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as CashierMetricRow[]) {
      rows.push({
        ...row,
        total_sales_volume: Number(row.total_sales_volume),
        total_hours_worked: Number(row.total_hours_worked),
        splh: Number(row.splh),
        average_ticket_size: Number(row.average_ticket_size),
        discount_frequency_rate: Number(row.discount_frequency_rate),
        refund_amount: Number(row.refund_amount),
        net_drawer_discrepancy: Number(row.net_drawer_discrepancy),
      });
    }
  }
  return rows;
}

export async function runStaffReport(
  supabase: ReportSupabaseClient,
  definition: ReportDefinition,
  params: QueryRunnerParams
): Promise<QueryRunnerResult> {
  const metrics = await fetchCashierMetrics(supabase, params);

  switch (definition.id) {
    case "REP-STF-01": {
      const rows = [...metrics]
        .sort((a, b) => b.total_sales_volume - a.total_sales_volume)
        .map((m) => ({
          cashier_name: m.cashier_name,
          total_sales_volume: round2(m.total_sales_volume),
          transaction_count: m.transaction_count,
          average_ticket_size: round2(m.average_ticket_size),
          net_drawer_discrepancy: round2(m.net_drawer_discrepancy),
        }));
      return { rows, totalRows: rows.length };
    }

    case "REP-STF-02": {
      const rows = [...metrics]
        .sort((a, b) => b.splh - a.splh)
        .map((m) => ({
          cashier_name: m.cashier_name,
          total_sales_volume: round2(m.total_sales_volume),
          total_hours_worked: round2(m.total_hours_worked),
          splh: round2(m.splh),
        }));
      return { rows, totalRows: rows.length };
    }

    case "REP-STF-03": {
      const rows = metrics.map((m) => ({
        cashier_name: m.cashier_name,
        transaction_count: m.transaction_count,
        discount_frequency_rate: round2(m.discount_frequency_rate),
        refund_count: m.refund_count,
        refund_rate_pct: m.transaction_count > 0 ? round2((m.refund_count / m.transaction_count) * 100) : 0,
      }));
      return { rows, totalRows: rows.length };
    }

    case "REP-STF-04": {
      const rows = metrics
        .map((m) => ({
          cashier_name: m.cashier_name,
          transaction_count: m.transaction_count,
          total_hours_worked: round2(m.total_hours_worked),
          orders_per_hour: m.total_hours_worked > 0 ? round2(m.transaction_count / m.total_hours_worked) : 0,
        }))
        .sort((a, b) => b.orders_per_hour - a.orders_per_hour);
      return { rows, totalRows: rows.length };
    }

    default:
      throw new Error(`Unimplemented staff report: ${definition.id}`);
  }
}
