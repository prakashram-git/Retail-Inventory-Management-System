"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin, runDriftCheck, type DriftCheckResult } from "@/lib/help/driftService";
import { getRegenerationJob, startRegenerationJob, type RegenerationJob } from "@/lib/help/regenerationJob";

export interface MaintenanceStatus {
  totalWorkflows: number;
  lastGeneratedAt: string | null;
  job: RegenerationJob | null;
  /** Whether this deployment can run the capture pipeline at all. */
  runner: "local" | "webhook" | "unavailable";
}

function runnerMode(): MaintenanceStatus["runner"] {
  if (process.env.HELP_REFRESH_WEBHOOK_URL) return "webhook";
  return process.env.VERCEL ? "unavailable" : "local";
}

export async function checkDocumentationDriftAction(): Promise<DriftCheckResult> {
  const supabase = await createClient();
  await requireSuperAdmin(supabase);
  return runDriftCheck(supabase, true);
}

export async function triggerScreenshotRegenerationAction(): Promise<
  { started: true; mode: "local" | "webhook" } | { started: false; reason: string }
> {
  const supabase = await createClient();
  await requireSuperAdmin(supabase);

  const mode = runnerMode();
  if (mode === "webhook") {
    const res = await fetch(process.env.HELP_REFRESH_WEBHOOK_URL!, { method: "POST" }).catch(() => null);
    return res?.ok
      ? { started: true, mode }
      : { started: false, reason: "The refresh webhook did not accept the request." };
  }
  if (mode === "unavailable") {
    return {
      started: false,
      reason:
        "Screenshot capture needs headless Chromium, which serverless hosting can't run. Set HELP_REFRESH_WEBHOOK_URL to a CI job, or run `npm run help:refresh-assets` locally.",
    };
  }

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : (h.get("x-forwarded-proto") ?? "https");
  if (getRegenerationJob()?.status === "running") return { started: true, mode };
  startRegenerationJob(`${proto}://${host}`);
  return { started: true, mode };
}

export async function getHelpMaintenanceStatusAction(): Promise<MaintenanceStatus> {
  const supabase = await createClient();
  await requireSuperAdmin(supabase);
  const { data } = await supabase
    .from("help_workflows")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1);
  const { count } = await supabase.from("help_workflows").select("id", { count: "exact", head: true });
  return {
    totalWorkflows: count ?? 0,
    lastGeneratedAt: data?.[0]?.updated_at ?? null,
    job: getRegenerationJob(),
    runner: runnerMode(),
  };
}
