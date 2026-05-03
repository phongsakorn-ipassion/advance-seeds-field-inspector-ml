alter table public.runs
  add column if not exists provider_job_id text;

create index if not exists runs_provider_job_id_idx
  on public.runs (provider_job_id)
  where provider_job_id is not null;
