export interface Runbook {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  commands?: string[];
}

/** Super-admin operational runbooks shown at /dashboard/settings/docs. */
export const RUNBOOKS: Runbook[] = [
  {
    id: "help-pipeline",
    title: "Help Center documentation pipeline",
    summary:
      "Workflow content lives in lib/help/workflows.ts and is seeded into help_workflows. Each workflow stores a SHA-256 (feature_hash) of the UI files it documents; when a file changes, the workflow is flagged as drifted until screenshots are regenerated.",
    steps: [
      "Edit a UI component listed in a workflow's sourceFiles — the workflow now shows 'UI changes detected. Screenshots out of date.'",
      "Settings → Help → Check UI Drift Now (or the CLI) to confirm which components changed.",
      "Regenerate Screenshots (needs a machine with Chromium and the app reachable), or run the CLI.",
      "After regenerating, feature_hash is refreshed and the drift flag clears.",
    ],
    commands: ["npm run help:check-drift", "npm run help:refresh-assets", "npm run help:seed", "npm run test:help"],
  },
  {
    id: "backup-dr",
    title: "Backup & disaster recovery",
    summary:
      "JSON/JSONL snapshots of every table are archived by the backup engine; restore goes through a SQL RPC you apply yourself. Archives are written locally, so copy them off-machine for real DR.",
    steps: [
      "Settings → Backup to create, list and download archives (14-day retention).",
      "The scheduled job is /api/cron/backup, authenticated with Bearer CRON_SECRET.",
      "Verify the engine end-to-end before relying on it.",
    ],
    commands: ["npm run backup:cli", "npm run backup:test"],
  },
  {
    id: "offline-sync",
    title: "Offline sales & sync",
    summary:
      "Sales made offline are queued in IndexedDB (offline_orders_queue) with an idempotency key and replayed to process_pos_checkout when the connection returns. Signing out with pending items is allowed but warned about.",
    steps: [
      "Never clear browser data on a terminal with pending offline sales.",
      "The connection badge shows the pending count; it clears after sync.",
      "A parked cart is stored in IndexedDB (parked_carts) and restored at the next POS visit.",
    ],
  },
  {
    id: "roles-rls",
    title: "Roles & data access",
    summary:
      "Access is enforced by Postgres row-level security using get_auth_role() and get_auth_store_id(); the UI only hides what RLS already forbids. Roles: super_admin, store_manager, cashier, ui_designer (layout only).",
    steps: [
      "Change roles from Settings → Staff, never by editing profiles directly.",
      "Help workflows are role-filtered by RLS (workflows_role_read) — a cashier's payload cannot contain admin workflows.",
      "Run the suites after any policy change.",
    ],
    commands: ["npm run test:layout-role", "npm run test:analytics", "npm run test:reporting", "npm run test:logout"],
  },
];
