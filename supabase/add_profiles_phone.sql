-- Adds a contact phone number to profiles. Not synced automatically to
-- auth.users.phone — the app does that explicitly (via the service-role
-- client) whenever a phone is set, so it can double as the identifier for
-- SMS-based password-reset OTPs once an SMS provider is configured in
-- Supabase Auth settings.
alter table public.profiles add column if not exists phone text;
