import type { SupabaseClient } from "@supabase/supabase-js";
import { computeFeatureHash } from "./driftDetector";
import { HELP_CATEGORIES, HELP_WORKFLOWS } from "./workflows";

/**
 * Upserts categories and workflows from the registry. Re-seeding keeps any
 * screenshot URLs already captured for a step and clears the drift flag,
 * because the hash is recomputed from the current source.
 */
export async function seedHelpContent(admin: SupabaseClient, root = process.cwd()) {
  const { error: catError } = await admin.from("help_categories").upsert(HELP_CATEGORIES);
  if (catError) throw new Error(`help_categories: ${catError.message}`);

  const { data: existing } = await admin.from("help_workflows").select("id, steps");
  const existingSteps = new Map(
    (existing ?? []).map((row) => [row.id as string, row.steps as Array<Record<string, unknown>>])
  );

  const rows = HELP_WORKFLOWS.map(({ sourceFiles: _sourceFiles, ...wf }) => {
    void _sourceFiles;
    const previous = existingSteps.get(wf.id) ?? [];
    return {
      ...wf,
      steps: wf.steps.map((s) => {
        const old = previous.find((p) => p.step_number === s.step_number);
        return {
          ...s,
          desktop_image_url: (old?.desktop_image_url as string | null) ?? s.desktop_image_url,
          mobile_image_url: (old?.mobile_image_url as string | null) ?? s.mobile_image_url,
        };
      }),
      feature_hash: computeFeatureHash(HELP_WORKFLOWS.find((d) => d.id === wf.id)!, root),
      drift_detected: false,
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await admin.from("help_workflows").upsert(rows);
  if (error) throw new Error(`help_workflows: ${error.message}`);
  return rows.length;
}
