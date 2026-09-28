-- Mall-wide typography (font family + size), applied to every form across
-- the dashboard and POS via app/layout.tsx (see lib/theme/typography.ts).
-- Global-only: lives on the system_settings row with store_id IS NULL, the
-- same row "Mall homepage wallpaper" already uses. No extra column-restrict
-- trigger is needed (unlike terminal_lock_settings.sql) because the
-- pre-existing system_settings_write RLS policy already only lets
-- super_admin touch that row — store_manager/ui_designer only match rows
-- where store_id = their own store, which store_id IS NULL never satisfies.
alter table public.system_settings
  add column if not exists form_font_family text not null default 'geist'
    constraint system_settings_font_family_values check (form_font_family in ('geist', 'inter', 'merriweather'));
alter table public.system_settings
  add column if not exists form_font_size text not null default 'medium'
    constraint system_settings_font_size_values check (form_font_size in ('small', 'medium', 'large'));
