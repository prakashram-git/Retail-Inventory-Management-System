import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeDrift } from "@/lib/help/driftDetector";

export const runtime = "nodejs";

/**
 * Post-deploy hook: recomputes drift for every workflow, flags drift_detected
 * (shown to super admins as "UI changes detected. Screenshots out of date."),
 * and, if HELP_REFRESH_WEBHOOK_URL is set, pings it so an external runner
 * (CI job with Playwright — serverless can't run Chromium) executes
 * `npm run help:refresh-assets`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await admin.from("help_workflows").select("id, feature_hash");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const stored = Object.fromEntries((data ?? []).map((r) => [r.id as string, r.feature_hash as string]));
  const report = computeDrift(stored);
  for (const r of report) {
    await admin.from("help_workflows").update({ drift_detected: r.drifted }).eq("id", r.workflowId);
  }
  const drifted = report.filter((r) => r.drifted).map((r) => r.workflowId);

  let refreshTriggered = false;
  const hook = process.env.HELP_REFRESH_WEBHOOK_URL;
  if (hook && drifted.length > 0) {
    refreshTriggered = (await fetch(hook, { method: "POST" }).catch(() => null))?.ok ?? false;
  }

  return NextResponse.json({ ok: true, drifted, refreshTriggered });
}
