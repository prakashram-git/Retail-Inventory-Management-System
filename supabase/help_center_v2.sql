-- Help Center v2: categories, role-gated workflows, per-user progress.
-- Content (rows) is seeded from lib/help/workflows.ts via `npm run help:seed`,
-- which also computes feature_hash. Idempotent: safe to re-run.

create table if not exists public.help_categories (
  id text primary key,
  title text not null,
  icon text not null default 'HelpCircle',
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists public.help_workflows (
  id text primary key,
  category_id text not null references public.help_categories(id) on delete cascade,
  title text not null,
  summary text not null,
  allowed_roles public.user_role[] not null
    default '{cashier,store_manager,ui_designer,super_admin}'::public.user_role[],
  target_route text,
  estimated_time_min integer not null default 2,
  steps jsonb not null default '[]'::jsonb,
  version text not null default '1.0.0',
  feature_hash text not null,
  drift_detected boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.help_user_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workflow_id text not null references public.help_workflows(id) on delete cascade,
  completed boolean not null default false,
  last_step_index integer not null default 0,
  completed_at timestamptz,
  feedback_rating integer check (feedback_rating between 1 and 5),
  unique (user_id, workflow_id)
);

create index if not exists help_workflows_category_idx on public.help_workflows(category_id);

alter table public.help_categories enable row level security;
alter table public.help_workflows enable row level security;
alter table public.help_user_progress enable row level security;

drop policy if exists help_read on public.help_categories;
create policy help_read on public.help_categories
  for select to authenticated using (true);

drop policy if exists workflows_role_read on public.help_workflows;
create policy workflows_role_read on public.help_workflows
  for select to authenticated using (get_auth_role() = any(allowed_roles));

drop policy if exists workflows_admin_write on public.help_workflows;
create policy workflows_admin_write on public.help_workflows
  for all to authenticated
  using (get_auth_role() in ('super_admin','ui_designer'))
  with check (get_auth_role() in ('super_admin','ui_designer'));

drop policy if exists progress_owner_access on public.help_user_progress;
create policy progress_owner_access on public.help_user_progress
  for all to authenticated
  using (user_id = auth.uid() or get_auth_role() = 'super_admin')
  with check (user_id = auth.uid() or get_auth_role() = 'super_admin');

notify pgrst, 'reload schema';
