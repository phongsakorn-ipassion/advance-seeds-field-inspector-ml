\set ON_ERROR_STOP on

-- Anon: can SELECT from versions, cannot INSERT.
SET ROLE anon;
SELECT count(*) >= 0 AS anon_select_versions FROM public.versions;

DO $$ BEGIN
  INSERT INTO public.versions(model_line_id, semver, metadata, tflite_r2_key,
                              size_bytes, content_hash)
  VALUES ((SELECT id FROM public.model_lines WHERE slug='seeds-poc'),
          'rls-test', '{"class_names":[],"input_size":1,"output_kind":"x","task":"y"}',
          'k', 1, 'h');
  RAISE EXCEPTION 'anon should not be able to insert';
EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
END $$;
RESET ROLE;

-- Authenticated (no admin claim): can SELECT runs, cannot UPDATE channels.
SET ROLE authenticated;
SELECT count(*) >= 0 AS auth_select_runs FROM public.runs;

DO $$ BEGIN
  UPDATE public.channels SET updated_by = gen_random_uuid()
  WHERE name = 'staging';
  RAISE EXCEPTION 'authenticated without admin should not be able to update channels';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;
