-- Store feature-flag profiles (e.g. a lean POS-only tablet vs. a full enterprise store).
-- `stores.active_profile_id` picks a named bundle from `store_profiles.features`;
-- `stores.custom_feature_overrides` lets one store deviate without a new profile.
-- Idempotent — safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.store_profiles (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  features jsonb NOT NULL DEFAULT '{
    "show_dashboard": true,
    "allow_new_product": false,
    "allow_new_category": false,
    "allow_pos_shortcut": true,
    "allow_reports_shortcut": false,
    "allow_variant_matrix": false,
    "high_performance_mode": true
  }'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed before stores.active_profile_id references this table.
INSERT INTO public.store_profiles (id, name, description, is_default, features)
VALUES
(
  'profile_lite_pos',
  'Lite Register (POS Only)',
  'Ultra-lightweight profile for front-line cashiers and tablets. Hides dashboards, heavy sheets, and report suites.',
  false,
  '{
    "show_dashboard": false,
    "allow_new_product": false,
    "allow_new_category": false,
    "allow_pos_shortcut": true,
    "allow_reports_shortcut": false,
    "allow_variant_matrix": false,
    "high_performance_mode": true
  }'::jsonb
),
(
  'profile_standard_retail',
  'Standard Retail Boutique',
  'Balanced profile for daily retail operations. Includes quick-actions, product entry, and operational dashboard.',
  true,
  '{
    "show_dashboard": true,
    "allow_new_product": true,
    "allow_new_category": false,
    "allow_pos_shortcut": true,
    "allow_reports_shortcut": true,
    "allow_variant_matrix": false,
    "high_performance_mode": false
  }'::jsonb
),
(
  'profile_enterprise',
  'Enterprise Multi-Unit',
  'Full administrative access with category builders, full variant matrices, and mall BI reporting.',
  false,
  '{
    "show_dashboard": true,
    "allow_new_product": true,
    "allow_new_category": true,
    "allow_pos_shortcut": true,
    "allow_reports_shortcut": true,
    "allow_variant_matrix": true,
    "high_performance_mode": false
  }'::jsonb
)
ON CONFLICT (id) DO UPDATE SET features = EXCLUDED.features;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS active_profile_id text REFERENCES public.store_profiles(id) DEFAULT 'profile_standard_retail',
  ADD COLUMN IF NOT EXISTS custom_feature_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Existing rows predate the column default.
UPDATE public.stores SET active_profile_id = 'profile_standard_retail' WHERE active_profile_id IS NULL;

ALTER TABLE public.store_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_profiles_read_all ON public.store_profiles;
CREATE POLICY store_profiles_read_all ON public.store_profiles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS store_profiles_super_admin_manage ON public.store_profiles;
CREATE POLICY store_profiles_super_admin_manage ON public.store_profiles
  FOR ALL TO authenticated
  USING (get_auth_role() = 'super_admin')
  WITH CHECK (get_auth_role() = 'super_admin');

COMMIT;

NOTIFY pgrst, 'reload schema';
