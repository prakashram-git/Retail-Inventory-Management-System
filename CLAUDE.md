# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

A multi-tenant mall retail POS + inventory system: Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4, backed by Supabase (Postgres, Auth, Storage). Stores share one database, scoped by `store_id`; roles are `super_admin` (mall-wide), `store_manager`, `cashier` (POS-only), and `ui_designer` (appearance/dashboard-layout only — see below).

## Commands

- `npm run dev` — start the dev server (Turbopack)
- `npm run build` — production build (also runs the TypeScript check)
- `npm run lint` — ESLint (flat config, includes the React Compiler plugin)
- `npx tsc --noEmit` — typecheck only, no build script wraps this

Standard verification loop before considering a change done: `npx tsc --noEmit` → `npx eslint .` → `npx next build`.

### Test scripts

There's no app-level test framework (no `test` script, no `*.test.ts` files), but `scripts/*.ts` are real integration tests that create disposable data in the live database and clean up after themselves:

- `npm run backup:test` — backup/restore engine
- `npm run test:layout-role` — `ui_designer` RBAC + dashboard layout publishing
- `npm run test:analytics` — executive digest / cashier scorecard RPCs
- `npm run test:reporting` — the 24-report catalog + export engine

All of them (and `npm run backup:cli`) run through `NODE_OPTIONS=--conditions=react-server tsx <script>` — omitting that flag makes any `server-only`-guarded import throw immediately (`tsx` isn't Next.js, so the `react-server` export condition that normally no-ops `server-only` in production isn't set by default). Don't run these with plain `npx tsx`.

## Architecture

### Next.js 16 is not the Next.js in your training data
Read `node_modules/next/dist/docs/` before touching routing/middleware/caching APIs. Two concrete breaks already hit in this repo: the middleware file is `proxy.ts` (function must be named `proxy`, not `middleware`), and `cookies()`/`headers()` are fully async with no sync fallback.

### Store resolution — the recurring bug class
A `super_admin` has `profiles.store_id = null`; their active store comes from the `mall_active_store_id` cookie (`lib/constants.ts`) instead. Every place that resolves "which store is this request for" must fall back to the mall's alphabetically-first store when that cookie is absent, via `resolveActiveStoreId()` (`lib/store/resolve-active-store.ts`) — never fall back to `profile.store_id` directly for a super_admin, it's always null and silently produces `storeId = null`. This has caused real bugs twice: a `NOT NULL` constraint crash on `cash_drawer_sessions.store_id`, and silently-empty dashboard pages. Server Components call it directly; Server Actions get it through `requireStoreContext()` (`lib/actions/shared.ts`), which all mutation actions must call rather than resolving storeId themselves.

### Auth & authorization layers
- `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (Server Components/Actions, async cookie-based), `lib/supabase/admin.ts` (service-role, `server-only`, used only for admin-privileged operations like creating Auth users).
- `proxy.ts` refreshes the session and enforces route-level RBAC (cashier → `/pos`; `ui_designer` → anything outside `/dashboard`, `/dashboard/settings/appearance`, `/dashboard/settings/layout-builder`, `/dashboard/settings/account` gets bounced to appearance; unauthenticated → `/login`). This is a convenience redirect only, not the real boundary.
- `requireStoreContext()` / `requireSuperAdmin()` / `requireLayoutEditor()` (`lib/actions/shared.ts`) are the Server Action-side authorization helpers. `requireStoreContext()` rejects `cashier` and `ui_designer` outright (neither may mutate products/categories/inventory). `requireLayoutEditor()` allows `super_admin` and `ui_designer` only, and always pins a `ui_designer` to their own store regardless of the active-store cookie.
- **The database is the real security boundary, not the app.** RLS policies split every mutable table's `FOR ALL` into a tenant-scoped `SELECT` (open to any role) plus role-restricted `INSERT`/`UPDATE`/`DELETE`, using the Postgres functions `get_auth_role()`/`get_auth_store_id()` — see `supabase/role_scoped_write_policies.sql` (products/categories/inventory_logs) and `supabase/analytics_foundation.sql` (orders/order_items, added later after an audit found they'd been left as a single ungated policy). This matters because the Supabase publishable key is exposed to every browser — a Next.js-layer check alone can always be bypassed by calling Supabase directly. Any new mutable table needs the same split, not a single `FOR ALL` policy.
- `cash_drawer_sessions` is the one exception to "just split by role": cashiers legitimately open/close their own drawer from the client. RLS lets a cashier `INSERT` only their own row, but `UPDATE` is `super_admin`/`store_manager` only — closing a shift instead calls the `close_cash_drawer_session` RPC (`supabase/analytics_foundation.sql`), which recomputes `expected_cash`/`discrepancy` from the real orders ledger server-side rather than trusting whatever the client submits.

### Ledger immutability
`orders`, `order_items`, and `inventory_logs` each have a `BEFORE UPDATE/DELETE` trigger (`prevent_ledger_modification()`, `supabase/prevent_ledger_modification.sql`) that unconditionally blocks mutation/deletion — including from the service-role key, including on a cascade delete triggered by removing a parent row (e.g. deleting a store doesn't cascade-clean its orders for free). The only sanctioned way around it is a transaction-local bypass a trusted `SECURITY DEFINER` RPC sets for itself: `PERFORM set_config('app.bypass_ledger_guard', 'on', true)` before its own writes (see `process_pos_checkout`, `process_order_refund`, `restore_upsert_ledger`). Never disable or drop this trigger to make a mutation work — add the bypass inside a purpose-built RPC instead, scoped to that one transaction. (The test scripts under `scripts/` that create and tear down disposable orders bypass it the same way, via a direct `pg` connection with `set_config(..., false)` — session-scoped rather than transaction-local, since each cleanup statement there is its own implicit transaction.)

Consequence for products: `deleteProduct` is a soft delete (`is_active = false`), not a hard `DELETE` — `inventory_logs.product_id`/`order_items.product_id` are FKs with no cascade, so hard-deleting a product with any history fails. The inventory management table intentionally still lists inactive products (badged "Inactive"); only the POS catalog filters `is_active = true`.

### Historical price fidelity: `order_items.unit_cost`
`order_items.unit_cost` snapshots `products.cost_price` at sale time (set by `process_pos_checkout`), the same way `unit_price` already snapshotted the sale price. Any margin/COGS/profit calculation must read `unit_cost`, never join live `products.cost_price` — a supplier cost change must not retroactively change the recorded margin on past orders. Rows written before this column existed were backfilled from whatever `cost_price` was at backfill time, which is a best-effort approximation, not a true historical value (no better data exists for them).

### SQL objects live in the database, not in a migration pipeline
RPCs, RLS policies, and trigger functions are tracked as `.sql` files under `supabase/` but nothing applies them automatically — no `npm` script, no CI step. Applying one needs either the Supabase SQL editor, or a direct Postgres connection (`pg` against a `SUPABASE_DB_URL` connection string, when one is available in the environment — PostgREST/the Supabase JS client cannot run DDL). Before assuming a referenced RPC or policy works, verify it's actually applied against the target database — this repo has shipped with `.sql` files present but never run more than once. `ALTER TYPE ... ADD VALUE` (e.g. adding a new role to the `user_role` enum) additionally cannot run in the same transaction as anything that uses the new value — apply it as its own statement first.

### Server Action + shared Zod schema pattern
`"use server"` files can only export async functions, so a schema used by both a Server Action and a client-side `react-hook-form` resolver has to live in its own plain module (e.g. `lib/products/schema.ts`, imported by both `lib/actions/products.ts` and `components/dashboard/inventory/ProductSheet.tsx`). Follow this split for any new form. The same constraint means a plain (non-action) server-side helper that a Server Component calls directly — e.g. `lib/dashboard/resolve-layout.ts` — must live outside the `"use server"` file even if a sibling action file (`lib/actions/dashboard-layout.ts`) does the writing side of the same feature.

### Customizable dashboard (`dashboard_layouts`)
The dashboard home (`app/dashboard/page.tsx` → `components/dashboard/home/HomeDashboard.tsx`) renders a store's `dashboard_layouts` row (falling back to the mall-wide row, then to `DEFAULT_LAYOUT_CONFIG` in `lib/dashboard/layout-types.ts` if neither exists). `WIDGET_CATALOG` in that file is the fixed set of widget ids the layout builder (`components/dashboard/settings/LayoutBuilder.tsx`, at `/dashboard/settings/layout-builder`) can arrange — every id there must have a matching entry in `HomeDashboard.tsx`'s `widgetRegistry` map, or it silently doesn't render. The builder edits order + a 3-step width (`packLayout()` derives `x`/`y` by row-packing on a 12-column grid) rather than freeform pixel placement. `widget_pinned_report` is the one widget with per-instance config (`{ reportId }`, picked via a dropdown in its own builder row) rather than a fixed component. Only `super_admin` and `ui_designer` can publish a layout (`requireLayoutEditor()`); a `ui_designer` can only ever target their own store, never the mall-wide (`store_id IS NULL`) default.

### Report Library (`lib/reports/`)
`lib/reports/catalog.ts` is the registry of all 24 report templates (id, pillar, columns, optional group-by). `lib/reports/queryRunner.ts` dispatches by pillar to `lib/reports/runners/{sales,inventory,finance,audit,staff}.ts`, each with real per-report Supabase queries — `staff.ts` calls the `get_cashier_performance_metrics` RPC once per store rather than re-deriving it in JS. `lib/actions/reports.ts` is the auth boundary: `allStores` is only honored for `super_admin`, everyone else is always pinned to their own store regardless of what the client requests. `lib/reports/exporter.ts` splits pure buffer/string builders (`buildCsvString`, `buildExcelWorkbook` — Node-testable) from the browser-only download trigger (`exportToCsv`, `exportToExcel`, ...) — a script can exercise the real export logic without a DOM. CSV export sanitizes any cell starting with `=`, `+`, `-`, or `@` (CWE-1236 formula injection) by prefixing a single quote.

This is a second surface from the older `/dashboard/reports` chart dashboard (`components/dashboard/reports/ReportsDashboard.tsx`) — that one was kept as-is rather than replaced; the 24-report catalog lives at `/dashboard/reports/library`.

### Backup / disaster-recovery engine (`lib/backup/`)
`lib/backup/backupEngine.ts` snapshots every table to JSON/JSONL under `lib/backup/paths.ts`'s resolved directory (`BACKUP_STORAGE_DIR`, falling back to `/tmp/backups` with a warning if the configured path isn't writable — Vercel's filesystem is read-only and ephemeral outside `/tmp`, so archives there don't survive a redeploy unless `BACKUP_STORAGE_DIR` points at real persistent storage or `lib/backup/s3.ts`'s cold-vault upload is wired up). `lib/backup/crypto.ts` encrypts archives as `[salt][iv][ciphertext][tag]` — the auth tag trails the ciphertext (not a fixed header before it) because AES-GCM only produces it after the whole stream is encrypted. Restoring into `orders`/`order_items`/`inventory_logs` needs the `restore_upsert_ledger` RPC (`supabase/restore_ledger_bypass.sql`) to get past the ledger-immutability trigger for rows that already exist; a restore of rows that were merely deleted is a plain insert and needs no bypass.

### Offline-first POS
`lib/offline/db.ts` defines the Dexie (IndexedDB) schema `MallRetailOfflineDB` (`cached_products`, `offline_orders_queue`, `offline_categories`). `SyncProvider` (`components/providers/SyncProvider.tsx`) tracks connectivity and auto-replays the queue on reconnect via `lib/offline/sync.ts`, calling the `process_pos_checkout` RPC with `p_is_offline: true`. A replayed sale against stock that's since changed lands as `status = 'completed_with_stock_variance'` with an `inventory_logs` row of `change_type = 'offline_variance'` — this is expected, reconcilable behavior, not a bug (and is why `current_stock` is allowed to go negative — don't add a `CHECK (current_stock >= 0)` constraint).

### GS1 barcode validation
`lib/utils/barcode.ts` `validateGS1Barcode()` implements the GTIN-8/12/13 mod-10 check digit. It's gated by a shape check (`/^\d{8}$|^\d{12}$|^\d{13}$/`) so plain alphanumeric SKUs skip validation. Wired into both the POS scan handler (`components/pos/PosTerminal.tsx`) and the product form schema (`lib/products/schema.ts`) — keep both in sync if the algorithm changes. `lib/pos/use-barcode-scanner.ts` is a hardware keyboard-wedge listener (buffers keystrokes, fires on Enter); the camera-based scanner in the stock-take screen (`components/dashboard/inventory/CameraBarcodeScanner.tsx`) is a separate implementation using the browser's native `BarcodeDetector` API, with no fallback library — it just reports "unsupported" on browsers without it (Safari, Firefox).

### Thermal receipt printing
`app/globals.css` has `@media print` rules that hide everything except `#receipt-print-area` (80mm width, JetBrains Mono, with its own `@page` rule). That `@page` rule is global to the stylesheet, not scoped to the element — a second printable feature that needs a different page size (e.g. the Report Library's A4 PDF export) must not reuse `#receipt-print-area`'s `@media print` block, or it inherits the 80mm sizing. The Executive Digest's "Flash PDF" export works around this by rendering into a separate `window.open()` popup with its own inline styles instead.

### Multi-currency
`lib/utils/currency.ts` handles zero-decimal (JPY/KRW/VND) and three-decimal (BHD/KWD/OMR) currencies correctly via `getCurrencyDecimals()`, not just USD-style 2-decimal — use `formatCurrency`/`getQuickTenderDenominations` rather than hand-rolling `Intl.NumberFormat` calls.

### UI primitives
`components/ui/*` are shadcn-style wrappers built on `@base-ui/react` (imports like `@base-ui/react/checkbox`), not Radix. When a needed primitive doesn't exist yet, scaffold it following an existing one (e.g. `components/ui/switch.tsx`) rather than introducing a different headless-UI library. Polymorphic components take a `render` prop (base-ui's convention), not Radix's `asChild`.

## Help Center

- Content lives in `lib/help/workflows.ts` (registry + `sourceFiles` hashed for drift). `npm run help:seed` upserts it to `help_workflows` (schema: `supabase/help_center_v2.sql`); role filtering is RLS (`get_auth_role() = ANY(allowed_roles)`).
- UI: `components/help/{HelpProvider,HelpCenterSheet,SpotlightTour,HelpButton}.tsx`; F1 toggles the drawer. Tour targets are `data-tour="..."` attributes — keep them when refactoring the POS/dashboard components.
- Training sandbox: `useHelp().trainingMode` → `submitCheckout({ is_training_mode })` short-circuits before any RPC/Dexie write; PosTerminal snapshots/restores stock and session.
- Editing a file listed in a workflow's `sourceFiles` causes drift: run `npm run help:check-drift`, then `npm run help:refresh-assets` (needs the app running; `BASE_URL`, `--only=wf_id`). `npm run test:help` runs TC-HLP-01..06.
- Dexie `offline_help_workflows` (db version 2) is the offline cache, refilled on every app launch.
