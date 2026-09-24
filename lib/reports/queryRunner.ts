import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getReportDefinition, type GroupByOption } from "./catalog";
import { runSalesReport } from "./runners/sales";
import { runInventoryReport } from "./runners/inventory";
import { runFinanceReport } from "./runners/finance";
import { runAuditReport } from "./runners/audit";
import { runStaffReport } from "./runners/staff";

export interface QueryRunnerParams {
  reportId: string;
  /** null = aggregate across every store in the mall — only ever honored for super_admin; the action layer resolves this. */
  storeId: string | null;
  storeIds: string[];
  startDate: string;
  endDate: string;
  timezone: string;
  groupBy?: GroupByOption;
  filters?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export interface QueryRunnerResult {
  rows: Record<string, unknown>[];
  totalRows: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReportSupabaseClient = SupabaseClient<any, any, any>;

export async function runReport(
  supabase: ReportSupabaseClient,
  params: QueryRunnerParams
): Promise<QueryRunnerResult> {
  const definition = getReportDefinition(params.reportId);
  if (!definition) throw new Error(`Unknown report id: ${params.reportId}`);

  switch (definition.pillar) {
    case "sales":
      return runSalesReport(supabase, definition, params);
    case "inventory":
      return runInventoryReport(supabase, definition, params);
    case "finance":
      return runFinanceReport(supabase, definition, params);
    case "audit":
      return runAuditReport(supabase, definition, params);
    case "staff":
      return runStaffReport(supabase, definition, params);
  }
}
