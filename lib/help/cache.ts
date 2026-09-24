"use client";

import { db, type OfflineHelpWorkflow } from "@/lib/offline/db";
import { fallbackIllustration } from "./illustrations";
import { HELP_CATEGORIES, HELP_WORKFLOWS } from "./workflows";
import type { HelpCategory, HelpPayload, HelpStep, HelpWorkflow } from "./types";
import type { UserRole } from "@/lib/types/domain";

/** Replaces the cached set for `role` with `payload`, adding SVG fallbacks. */
export async function cacheHelpPayload(payload: HelpPayload, role: UserRole): Promise<void> {
  const titles = new Map(payload.categories.map((c) => [c.id, c.title]));
  const rows: OfflineHelpWorkflow[] = payload.workflows.map((w) => ({
    id: w.id,
    cached_for_role: role,
    category_id: w.category_id,
    category_title: titles.get(w.category_id) ?? w.category_id,
    title: w.title,
    summary: w.summary,
    allowed_roles: w.allowed_roles,
    target_route: w.target_route,
    estimated_time_min: w.estimated_time_min,
    version: w.version,
    drift_detected: w.drift_detected,
    steps: w.steps,
    illustrations: Object.fromEntries(
      w.steps.map((s) => [s.step_number, fallbackIllustration(s, w.title)])
    ),
    cached_at: new Date().toISOString(),
  }));
  await db.transaction("rw", db.offline_help_workflows, async () => {
    await db.offline_help_workflows.clear();
    await db.offline_help_workflows.bulkPut(rows);
  });
}

export async function readCachedHelp(role: UserRole): Promise<HelpPayload | null> {
  const rows = (await db.offline_help_workflows.toArray()).filter(
    (r) => r.cached_for_role === role
  );
  if (rows.length === 0) return null;
  const categories = new Map<string, HelpCategory>();
  for (const r of rows) {
    categories.set(r.category_id, {
      id: r.category_id,
      title: r.category_title,
      icon: HELP_CATEGORIES.find((c) => c.id === r.category_id)?.icon ?? "HelpCircle",
      sort_order: HELP_CATEGORIES.find((c) => c.id === r.category_id)?.sort_order ?? 99,
      is_active: true,
    });
  }
  const workflows: HelpWorkflow[] = rows.map((r) => ({
    id: r.id,
    category_id: r.category_id,
    title: r.title,
    summary: r.summary,
    allowed_roles: r.allowed_roles as UserRole[],
    target_route: r.target_route,
    estimated_time_min: r.estimated_time_min,
    steps: r.steps as HelpStep[],
    version: r.version,
    feature_hash: "",
    drift_detected: r.drift_detected,
  }));
  return {
    categories: [...categories.values()].sort((a, b) => a.sort_order - b.sort_order),
    workflows,
  };
}

/** Cold-cache, offline-first-load fallback: the bundled registry, role-filtered. */
export function bundledHelp(role: UserRole): HelpPayload {
  const workflows: HelpWorkflow[] = HELP_WORKFLOWS.filter((w) =>
    w.allowed_roles.includes(role)
  ).map(({ sourceFiles: _omit, ...w }) => {
    void _omit;
    return { ...w, feature_hash: "", drift_detected: false };
  });
  const used = new Set(workflows.map((w) => w.category_id));
  return { categories: HELP_CATEGORIES.filter((c) => used.has(c.id)), workflows };
}
