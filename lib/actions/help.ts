"use server";

import { createClient } from "@/lib/supabase/server";
import type { HelpPayload, HelpProgress } from "@/lib/help/types";

/**
 * Role filtering is enforced by RLS (workflows_role_read), not here — the
 * user's own session is used so a cashier can never receive an admin workflow.
 */
export async function getHelpPayload(): Promise<HelpPayload> {
  const supabase = await createClient();
  const [cats, wfs] = await Promise.all([
    supabase.from("help_categories").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("help_workflows").select("*").order("title"),
  ]);
  if (cats.error) throw new Error(cats.error.message);
  if (wfs.error) throw new Error(wfs.error.message);
  const workflows = wfs.data ?? [];
  const used = new Set(workflows.map((w) => w.category_id));
  return {
    categories: (cats.data ?? []).filter((c) => used.has(c.id)),
    workflows,
  };
}

export async function getHelpProgress(): Promise<HelpProgress[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("help_user_progress")
    .select("workflow_id, completed, last_step_index, feedback_rating");
  return data ?? [];
}

export async function saveHelpProgress(input: {
  workflowId: string;
  lastStepIndex: number;
  completed?: boolean;
  feedbackRating?: number | null;
}): Promise<void> {
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) return;
  const row: Record<string, unknown> = {
    user_id: userResult.user.id,
    workflow_id: input.workflowId,
    last_step_index: input.lastStepIndex,
  };
  if (input.completed !== undefined) {
    row.completed = input.completed;
    row.completed_at = input.completed ? new Date().toISOString() : null;
  }
  if (input.feedbackRating !== undefined) row.feedback_rating = input.feedbackRating;
  await supabase.from("help_user_progress").upsert(row, { onConflict: "user_id,workflow_id" });
}
