-- Supabase Realtime ships a publication called `supabase_realtime`. By
-- default it is empty, so subscribing to postgres_changes from the browser
-- silently observes nothing. Add the four registry tables that the
-- dashboard subscribes to.

alter publication supabase_realtime add table public.runs;
alter publication supabase_realtime add table public.run_metrics;
alter publication supabase_realtime add table public.channels;
alter publication supabase_realtime add table public.versions;
