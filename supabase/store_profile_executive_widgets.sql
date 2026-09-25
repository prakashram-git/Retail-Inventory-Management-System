-- Adds `allow_executive_widgets` to the store-profile feature set: gates the BI-tier dashboard
-- widgets (Executive Digest, Cashier Leaderboard, Dead Stock Aging, Hourly Heatmap,
-- Sell-Through, Revenue vs COGS, Pinned Report) independently of `show_dashboard`, so a
-- profile can show a lean operational dashboard without the deeper analytics.
-- Idempotent — safe to re-run.

BEGIN;

ALTER TABLE public.store_profiles ALTER COLUMN features SET DEFAULT '{
  "show_dashboard": true,
  "allow_new_product": false,
  "allow_new_category": false,
  "allow_pos_shortcut": true,
  "allow_reports_shortcut": false,
  "allow_variant_matrix": false,
  "allow_executive_widgets": true,
  "high_performance_mode": true
}'::jsonb;

-- Defaults to whatever a store already saw: on for Enterprise and Standard (both already show
-- these widgets today, via the layout builder, independent of this flag) so introducing the
-- toggle doesn't silently take widgets away from an existing store; off only for Lite Register,
-- which hides the whole dashboard anyway. Only touches rows that predate this key.
UPDATE public.store_profiles
SET features = features || jsonb_build_object('allow_executive_widgets', (id <> 'profile_lite_pos')),
    updated_at = now()
WHERE NOT (features ? 'allow_executive_widgets');

COMMIT;

NOTIFY pgrst, 'reload schema';
