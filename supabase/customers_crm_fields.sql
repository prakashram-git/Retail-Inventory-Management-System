-- Gap-closing pass against leading retail POS/CRM customer profiles
-- (Shopify, Square, Lightspeed): every one of them splits a customer's name
-- into first/last (never a single blob — needed for sorting, personalized
-- receipts/emails, and duplicate detection), and every one captures explicit
-- marketing consent rather than defaulting a new contact into "subscribed."

-- 1. first_name / last_name, replacing the single full_name blob.
alter table public.customers add column if not exists first_name text;
alter table public.customers add column if not exists last_name text;

-- Backfill existing rows: naive split at the first space. Good enough for
-- the handful of rows that predate this migration — anything already wrong
-- (e.g. multi-word first names) is editable afterward like any other field.
-- position() returns 0 (not NULL) when there's no space at all, and
-- substring(str from 0+1) is just str again — nullif guards the no-space
-- case so a single-word name doesn't get duplicated into last_name too.
update public.customers
set
  first_name = coalesce(nullif(split_part(full_name, ' ', 1), ''), full_name),
  last_name = nullif(trim(substring(full_name from nullif(position(' ' in full_name), 0) + 1)), '')
where first_name is null;

alter table public.customers alter column first_name set not null;
-- last_name stays nullable — plenty of real customers (mononyms, or a
-- cashier who only caught a first name) legitimately have none.

-- full_name becomes a generated column instead of a stored free-text blob,
-- so every existing reader (POS receipt, search, the dashboard list) keeps
-- working unmodified — only the write path (the two customer forms) needed
-- to change to first_name/last_name.
alter table public.customers drop column full_name;
alter table public.customers add column full_name text
  generated always as (trim(both ' ' from first_name || ' ' || coalesce(last_name, ''))) stored;

-- 2. Explicit marketing consent (Shopify: "Email marketing"/"SMS marketing"
-- subscription; Square/Lightspeed have the same pattern) — defaults to false
-- so a walk-in registration never silently opts someone into marketing they
-- never agreed to (CAN-SPAM/TCPA-style opt-in, not opt-out).
alter table public.customers add column if not exists accepts_email_marketing boolean not null default false;
alter table public.customers add column if not exists accepts_sms_marketing boolean not null default false;

-- 3. Company/organization — every leading system supports a B2B/wholesale
-- contact having one, relevant here for mall tenants' corporate accounts.
alter table public.customers add column if not exists company text;

-- 4. Case-insensitive per-store email uniqueness, matching the phone index
-- customers.sql already has (same rationale: the primary real-world
-- identifiers for repeat-customer lookup and duplicate prevention). NULL/''
-- repeat freely.
create unique index if not exists uq_customers_store_email_case_insensitive
  on public.customers(store_id, lower(email))
  where email is not null and email <> '';
