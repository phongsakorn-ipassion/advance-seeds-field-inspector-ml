create table public.runs (
  id            uuid primary key default gen_random_uuid(),
  model_line_id uuid not null references public.model_lines(id),
  status        text not null check (status in ('running','succeeded','failed','cancelled')),
  config_yaml   jsonb not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  git_sha       text,
  host          text,
  hardware      jsonb,
  created_by    uuid
);

create index runs_model_line_started_idx
  on public.runs (model_line_id, started_at desc);

create table public.run_metrics (
  run_id      uuid not null references public.runs(id) on delete cascade,
  step        int not null,
  epoch       int,
  name        text not null,
  value       double precision not null,
  recorded_at timestamptz not null default now()
);

create index run_metrics_run_name_step_idx
  on public.run_metrics (run_id, name, step);
