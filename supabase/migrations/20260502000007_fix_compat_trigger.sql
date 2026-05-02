create or replace function public.versions_set_compat_signature()
returns trigger language plpgsql as $$
begin
  new.compat_signature := public.compute_compat_signature(
    array(select jsonb_array_elements_text(new.metadata->'class_names')),
    (new.metadata->>'input_size')::int,
    new.metadata->>'output_kind',
    new.metadata->>'task'
  );
  return new;
end;
$$;
