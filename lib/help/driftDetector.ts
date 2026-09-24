import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { HELP_WORKFLOWS, type WorkflowDefinition } from "./workflows";

/** SHA-256 over the concatenated source of the components a workflow documents. */
export function computeFeatureHash(def: WorkflowDefinition, root = process.cwd()): string {
  const hash = createHash("sha256");
  for (const file of [...def.sourceFiles].sort()) {
    const full = path.join(root, file);
    hash.update(`${file}\0`);
    hash.update(existsSync(full) ? readFileSync(full) : "MISSING");
  }
  return hash.digest("hex");
}

export interface DriftReport {
  workflowId: string;
  stored: string | null;
  current: string;
  drifted: boolean;
}

export function computeDrift(
  stored: Record<string, string>,
  root = process.cwd()
): DriftReport[] {
  return HELP_WORKFLOWS.map((def) => {
    const current = computeFeatureHash(def, root);
    const previous = stored[def.id] ?? null;
    return { workflowId: def.id, stored: previous, current, drifted: previous !== current };
  });
}
