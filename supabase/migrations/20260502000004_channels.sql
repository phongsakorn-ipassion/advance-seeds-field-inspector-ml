create table public.channels (
  id                 uuid primary key default gen_random_uuid(),
  model_line_id      uuid not null references public.model_lines(id),
  name               text not null check (name in ('staging','production')),
  current_version_id uuid references public.versions(id),
  updated_at         timestamptz not null default now(),
  updated_by         uuid,
  unique (model_line_id, name)
);

create table public.channel_history (
  id              uuid primary key default gen_random_uuid(),
  channel_id      uuid not null references public.channels(id) on delete cascade,
  from_version_id uuid references public.versions(id),
  to_version_id   uuid references public.versions(id),
  reason          text,
  changed_at      timestamptz not null default now(),
  changed_by      uuid
);

create or replace function public.channels_audit()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.current_version_id is distinct from old.current_version_id then
    insert into public.channel_history(
      channel_id, from_version_id, to_version_id, changed_by)
    values (new.id, old.current_version_id, new.current_version_id, new.updated_by);
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger channels_audit
before update on public.channels
for each row execute function public.channels_audit();

-- Seed the two channels for the PoC line, both initially unset.
insert into public.channels(model_line_id, name)
select id, 'staging'    from public.model_lines where slug='seeds-poc';
insert into public.channels(model_line_id, name)
select id, 'production' from public.model_lines where slug='seeds-poc';
