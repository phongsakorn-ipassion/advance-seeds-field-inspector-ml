-- The earlier migration revoked INSERT/UPDATE/DELETE on the registry tables
-- from `authenticated`, intending to surface insufficient_privilege for
-- non-admin writes. That blocks legitimate admin writes too, because
-- Supabase Auth always issues the `authenticated` Postgres role regardless of
-- JWT claims — `app_metadata.role = "admin"` is read inside RLS via
-- `is_admin()`, never as a role membership.
--
-- Grant the verbs back; RLS policies (with `using (public.is_admin())` and
-- `with check (public.is_admin())`) remain the actual security boundary.

grant insert, update, delete
  on public.model_lines, public.runs, public.run_metrics,
     public.versions, public.channels, public.channel_history
  to authenticated;
