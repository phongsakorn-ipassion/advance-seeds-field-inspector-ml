-- Tables published via supabase_realtime need REPLICA IDENTITY FULL for
-- DELETE operations to include the old row data in the WAL stream. With
-- the default (primary-key only) identity, Realtime subscribers see DELETE
-- events with NULL old.* columns AND PostgREST DELETE calls can fail with
-- 500 on some Supabase Realtime configurations.
--
-- Setting FULL is safe but increases WAL size proportional to row width;
-- fine for these small registry tables.

alter table public.runs           replica identity full;
alter table public.run_metrics    replica identity full;
alter table public.channels       replica identity full;
alter table public.versions       replica identity full;
