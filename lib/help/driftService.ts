import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeDrift } from "./driftDetector";
import { HELP_WORKFLOWS } from "./workflows";

export interface DriftCheckResult {
  driftDetected: boolean;
  checkedAt: string;
  /** Component names (from the drifted workflows' source files). */
  components: string[];
  workflows: { id: string; title: string; drifted: boolean; storedHash: string | null; currentHash: string }[];
  /** workflow id -> current SHA-256 of its UI sources. */
  hashes: Record<string, string>;
}

/**
 * Role check by the caller's own session, so it is the same `get_auth_role()`
 * the RLS policies use — not anything the client sent.
 */
export async function requireSuperAdmin(supabase: SupabaseClient): Promise<string> {
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) throw new Error("Unauthorized");
  const { data: role, error } = await supabase.rpc("get_auth_role");
  if (error || role !== "super_admin") throw new Error("Unauthorized");
  return userResult.user.id;
}

/** Hashes the UI sources, compares to help_workflows.feature_hash and (optionally) persists drift_detected. */
export async function runDriftCheck(supabase: SupabaseClient, persist = true): Promise<DriftCheckResult> {
  const { data, error } = await supabase.from("help_workflows").select("id, feature_hash");
  if (error) throw new Error(error.message);
  const stored = Object.fromEntries((data ?? []).map((r) => [r.id as string, r.feature_hash as string]));
  const report = computeDrift(stored);

  if (persist) {
    for (const r of report) {
      await supabase.from("help_workflows").update({ drift_detected: r.drifted }).eq("id", r.workflowId);
    }
  }

  const defs = new Map(HELP_WORKFLOWS.map((d) => [d.id, d]));
  const drifted = report.filter((r) => r.drifted);
  const components = [
    ...new Set(
      drifted.flatMap((r) => (defs.get(r.workflowId)?.sourceFiles ?? []).map((f) => path.basename(f).replace(/\.[jt]sx?$/, "")))
    ),
  ].sort();

  return {
    driftDetected: drifted.length > 0,
    checkedAt: new Date().toISOString(),
    components,
    workflows: report.map((r) => ({
      id: r.workflowId,
      title: defs.get(r.workflowId)?.title ?? r.workflowId,
      drifted: r.drifted,
      storedHash: r.stored,
      currentHash: r.current,
    })),
    hashes: Object.fromEntries(report.map((r) => [r.workflowId, r.current])),
  };
}
