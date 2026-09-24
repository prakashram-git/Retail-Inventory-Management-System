"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStoreContext } from "./shared";
import { runReport, type QueryRunnerResult } from "@/lib/reports/queryRunner";
import { getReportDefinition } from "@/lib/reports/catalog";

const runReportInputSchema = z.object({
  reportId: z.string().min(1),
  allStores: z.boolean().default(false),
  startDate: z.string(),
  endDate: z.string(),
  groupBy: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  limit: z.number().int().positive().max(5000).optional(),
});
export type RunReportInput = z.input<typeof runReportInputSchema>;

/**
 * "All stores" is honored only for super_admin — anyone else always gets
 * their own store regardless of what the client asks for, same trust
 * boundary requireStoreContext() already enforces elsewhere in this app.
 */
export async function executeReport(input: RunReportInput): Promise<QueryRunnerResult> {
  const parsed = runReportInputSchema.parse(input);
  const definition = getReportDefinition(parsed.reportId);
  if (!definition) throw new Error(`Unknown report: ${parsed.reportId}`);

  const { supabase, storeId, role } = await requireStoreContext();

  let storeIds: string[];
  if (role === "super_admin" && (parsed.allStores || definition.alwaysMultiStoreCapable)) {
    const { data: stores, error } = await supabase.from("stores").select("id");
    if (error) throw new Error(error.message);
    storeIds = (stores ?? []).map((s) => s.id);
  } else {
    storeIds = [storeId];
  }

  const { data: store } = await supabase.from("stores").select("timezone").eq("id", storeId).single();
  const timezone = store?.timezone ?? "UTC";

  return runReport(supabase, {
    reportId: parsed.reportId,
    storeId: role === "super_admin" && parsed.allStores ? null : storeId,
    storeIds,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    timezone,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    groupBy: parsed.groupBy as any,
    filters: parsed.filters,
    limit: parsed.limit,
  });
}

const presetInputSchema = z.object({
  reportId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  selectedColumns: z.array(z.string()),
  filters: z.record(z.string(), z.unknown()).default({}),
  groupBy: z.string().nullish(),
  isDefault: z.boolean().default(false),
});
export type SavePresetInput = z.input<typeof presetInputSchema>;

export async function saveReportPreset(input: SavePresetInput) {
  const parsed = presetInputSchema.parse(input);
  const { supabase, storeId } = await requireStoreContext();
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) throw new Error("Not authenticated");

  const { error } = await supabase.from("user_report_presets").insert({
    user_id: userResult.user.id,
    store_id: storeId,
    report_id: parsed.reportId,
    name: parsed.name,
    selected_columns: parsed.selectedColumns,
    filters: parsed.filters,
    group_by: parsed.groupBy ?? null,
    is_default: parsed.isDefault,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/reports/library");
}

export interface ReportPresetRow {
  id: string;
  report_id: string;
  name: string;
  selected_columns: string[];
  filters: Record<string, unknown>;
  group_by: string | null;
  is_default: boolean;
}

export async function listReportPresets(reportId: string): Promise<ReportPresetRow[]> {
  const { supabase } = await requireStoreContext();
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("user_report_presets")
    .select("id, report_id, name, selected_columns, filters, group_by, is_default")
    .eq("report_id", reportId)
    .eq("user_id", userResult.user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ReportPresetRow[];
}

export async function deleteReportPreset(id: string) {
  const { supabase } = await requireStoreContext();
  const { error } = await supabase.from("user_report_presets").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/reports/library");
}
