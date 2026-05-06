alter table public.versions
  add column if not exists pytorch_r2_key text;
