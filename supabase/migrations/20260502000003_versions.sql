-- Canonical JSON for compat: fixed key order, no whitespace.
create or replace function public.compute_compat_signature(
  class_names text[],
  input_size int,
  output_kind text,
  task text
) returns text
language sql immutable as $$
  select encode(
    digest(
      '{"class_names":' || to_jsonb(class_names)::text
        || ',"input_size":' || input_size::text
        || ',"output_kind":' || to_jsonb(output_kind)::text
        || ',"task":' || to_jsonb(task)::text
        || '}',
      'sha256'
    ),
    'hex'
  );
$$;

create table public.versions (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid references public.runs(id) on delete set null,
  model_line_id    uuid not null references public.model_lines(id),
  semver           text not null,
  compat_signature text,
  metadata         jsonb not null,
  tflite_r2_key    text not null,
  mlmodel_r2_key   text,
  size_bytes       bigint not null,
  content_hash     text not null,
  created_at       timestamptz not null default now(),
  created_by       uuid,
  unique (model_line_id, semver)
);

create or replace function public.versions_set_compat_signature()
returns trigger language plpgsql as $$
begin
  if new.compat_signature is null then
    new.compat_signature := public.compute_compat_signature(
      array(select jsonb_array_elements_text(new.metadata->'class_names')),
      (new.metadata->>'input_size')::int,
      new.metadata->>'output_kind',
      new.metadata->>'task'
    );
  end if;
  return new;
end;
$$;

create trigger versions_set_compat_signature
before insert or update on public.versions
for each row execute function public.versions_set_compat_signature();
