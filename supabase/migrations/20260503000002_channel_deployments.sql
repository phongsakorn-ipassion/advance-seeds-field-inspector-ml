create table if not exists public.channel_deployments (
  id            uuid primary key default gen_random_uuid(),
  model_line_id uuid not null references public.model_lines(id),
  channel_name  text not null check (channel_name in ('staging','production')),
  version_id    uuid not null references public.versions(id) on delete cascade,
  status        text not null default 'active' check (status in ('active','archived')),
  is_default    boolean not null default false,
  deployed_at   timestamptz not null default now(),
  deployed_by   uuid,
  archived_at   timestamptz,
  archived_by   uuid,
  unique (model_line_id, channel_name, version_id)
);

create unique index if not exists channel_deployments_one_default_idx
  on public.channel_deployments (model_line_id, channel_name)
  where status = 'active' and is_default;

create index if not exists channel_deployments_active_idx
  on public.channel_deployments (model_line_id, channel_name, status);

alter table public.channel_deployments enable row level security;

create policy cd_select_all on public.channel_deployments
  for select using (true);

create policy cd_admin_write on public.channel_deployments
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete
  on public.channel_deployments to authenticated;

alter table public.channel_deployments replica identity full;

alter publication supabase_realtime add table public.channel_deployments;

insert into public.channel_deployments(model_line_id, channel_name, version_id, is_default, deployed_at, deployed_by)
select c.model_line_id, c.name, c.current_version_id, true, c.updated_at, c.updated_by
from public.channels c
where c.current_version_id is not null
on conflict (model_line_id, channel_name, version_id)
do update set status = 'active', is_default = true, archived_at = null, archived_by = null;
