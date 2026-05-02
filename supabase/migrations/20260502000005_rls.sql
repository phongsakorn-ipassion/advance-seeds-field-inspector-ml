-- Helper: does the current JWT carry the admin role?
-- Service-role calls already bypass RLS by virtue of the postgres role they
-- run as, so this only needs to recognize admin users authenticated via
-- normal sign-in. Convention: admin users have app_metadata.role = 'admin'.
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb
      -> 'app_metadata' ->> 'role', ''
  ) = 'admin';
$$;

-- Enable RLS
alter table public.model_lines     enable row level security;
alter table public.runs            enable row level security;
alter table public.run_metrics     enable row level security;
alter table public.versions        enable row level security;
alter table public.channels        enable row level security;
alter table public.channel_history enable row level security;

-- Public-readable: model_lines, versions, channels, channel_history
create policy ml_select_all on public.model_lines
  for select using (true);
create policy ver_select_all on public.versions
  for select using (true);
create policy ch_select_all on public.channels
  for select using (true);
create policy chh_select_all on public.channel_history
  for select using (true);

-- Authenticated read: runs, run_metrics
create policy runs_select_auth on public.runs
  for select using (auth.role() = 'authenticated' or public.is_admin());
create policy rm_select_auth on public.run_metrics
  for select using (auth.role() = 'authenticated' or public.is_admin());

-- Admin-only writes on every table
create policy ml_admin_write   on public.model_lines     for all using (public.is_admin()) with check (public.is_admin());
create policy runs_admin_write on public.runs            for all using (public.is_admin()) with check (public.is_admin());
create policy rm_admin_write   on public.run_metrics     for all using (public.is_admin()) with check (public.is_admin());
create policy ver_admin_write  on public.versions        for all using (public.is_admin()) with check (public.is_admin());
create policy ch_admin_write   on public.channels        for all using (public.is_admin()) with check (public.is_admin());
create policy chh_admin_write  on public.channel_history for all using (public.is_admin()) with check (public.is_admin());

-- Revoke write privileges from non-admin roles so insufficient_privilege is
-- raised rather than silent UPDATE 0 (RLS alone only hides rows, not the verb).
revoke insert, update, delete, truncate
  on public.model_lines, public.runs, public.run_metrics,
     public.versions, public.channels, public.channel_history
  from anon, authenticated;
