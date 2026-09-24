#!/usr/bin/env -S npx tsx
/**
 * Compares SHA-256 hashes of each workflow's UI source files against
 * help_workflows.feature_hash. Flags drift_detected in the database (the Help
 * Management view shows "UI changes detected. Screenshots out of date.").
 * Exit codes: 0 = in sync, 2 = drift warning, 1 = error.
 * Flags: --no-write to skip updating drift_detected.
 */
import { adminClient } from "./_help-env";
import { computeDrift } from "../lib/help/driftDetector";

export const DRIFT_EXIT_CODE = 2;

async function main() {
  const admin = adminClient();
  const { data, error } = await admin.from("help_workflows").select("id, feature_hash");
  if (error) throw new Error(error.message);
  const stored = Object.fromEntries((data ?? []).map((r) => [r.id as string, r.feature_hash as string]));
  const report = computeDrift(stored);
  const drifted = report.filter((r) => r.drifted);

  if (!process.argv.includes("--no-write")) {
    for (const r of report) {
      await admin.from("help_workflows").update({ drift_detected: r.drifted }).eq("id", r.workflowId);
    }
  }

  if (drifted.length === 0) {
    console.log("Help drift check: all workflows in sync.");
    return 0;
  }
  console.warn(`DRIFT WARNING: UI changes detected. Screenshots out of date for ${drifted.length} workflow(s):`);
  for (const r of drifted) console.warn(`  - ${r.workflowId}`);
  console.warn("Run `npm run help:refresh-assets` to regenerate.");
  return DRIFT_EXIT_CODE;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
