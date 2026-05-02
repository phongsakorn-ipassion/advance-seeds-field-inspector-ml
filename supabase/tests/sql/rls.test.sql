BEGIN;
SELECT plan(4);

-- 1. anon can SELECT from versions
SET ROLE anon;
SELECT ok(
  (SELECT count(*) >= 0 FROM public.versions),
  'anon can SELECT versions'
);

-- 2. anon cannot INSERT into versions
SELECT throws_ok(
  $$INSERT INTO public.versions(model_line_id, semver, metadata, tflite_r2_key, size_bytes, content_hash)
      VALUES ((SELECT id FROM public.model_lines WHERE slug='seeds-poc'),
              'rls-anon-test', '{"class_names":[],"input_size":1,"output_kind":"x","task":"y"}',
              'k', 1, 'h')$$,
  NULL, NULL,
  'anon cannot INSERT versions'
);
RESET ROLE;

-- 3. authenticated (no admin claim) can SELECT runs
SET ROLE authenticated;
SELECT ok(
  (SELECT count(*) >= 0 FROM public.runs),
  'authenticated can SELECT runs'
);

-- 4. authenticated (no admin claim) cannot UPDATE channels
SELECT throws_ok(
  $$UPDATE public.channels SET updated_by = gen_random_uuid() WHERE name = 'staging'$$,
  NULL, NULL,
  'authenticated without admin cannot UPDATE channels'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
