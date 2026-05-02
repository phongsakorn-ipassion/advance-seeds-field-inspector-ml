create extension if not exists pgcrypto;

create table public.model_lines (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  display_name text not null,
  created_at   timestamptz not null default now()
);

insert into public.model_lines (slug, display_name)
  values ('seeds-poc', 'Seeds PoC');
