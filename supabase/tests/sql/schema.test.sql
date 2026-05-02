BEGIN;
SELECT plan(5);

-- 1. model_lines table exists
SELECT has_table('public', 'model_lines', 'model_lines table exists');

-- 2. seeds-poc seed row present
SELECT ok(
  EXISTS(SELECT 1 FROM public.model_lines WHERE slug = 'seeds-poc'),
  'seeds-poc model line seeded'
);

-- 3. runs status CHECK rejects invalid value
SELECT throws_ok(
  $$INSERT INTO public.runs(model_line_id, status, config_yaml)
      VALUES ((SELECT id FROM public.model_lines WHERE slug='seeds-poc'),
              'invalid-status', '{}'::jsonb)$$,
  '23514',
  NULL,
  'runs.status CHECK rejects invalid value'
);

-- 4. run_metrics index exists
SELECT ok(
  EXISTS(
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'run_metrics'
      AND indexname  = 'run_metrics_run_name_step_idx'
  ),
  'run_metrics composite index present'
);

-- 5. channels audit trigger fires on UPDATE — count delta must be exactly 1
DO $$
DECLARE
  v_version_id uuid;
  before_count int;
  after_count  int;
BEGIN
  WITH ml AS (SELECT id FROM public.model_lines WHERE slug = 'seeds-poc')
  INSERT INTO public.versions(model_line_id, semver, metadata,
                              tflite_r2_key, size_bytes, content_hash)
  VALUES (
    (SELECT id FROM ml),
    '0.0.1-schema-test',
    jsonb_build_object(
      'class_names',  jsonb_build_array('apple'),
      'input_size',   320,
      'output_kind',  'end2end_nms_free',
      'task',         'segment'
    ),
    'fixtures/schema-test.tflite', 100, 'sha256:schema-test'
  )
  ON CONFLICT (model_line_id, semver) DO UPDATE
    SET metadata = EXCLUDED.metadata
  RETURNING id INTO v_version_id;

  SELECT count(*)::int INTO before_count
  FROM public.channel_history WHERE to_version_id = v_version_id;

  WITH ml AS (SELECT id FROM public.model_lines WHERE slug = 'seeds-poc')
  UPDATE public.channels
  SET current_version_id = v_version_id,
      updated_by         = '00000000-0000-0000-0000-000000000000'
  WHERE model_line_id = (SELECT id FROM ml) AND name = 'staging';

  SELECT count(*)::int INTO after_count
  FROM public.channel_history WHERE to_version_id = v_version_id;

  IF (after_count - before_count) <> 1 THEN
    RAISE EXCEPTION 'expected 1 new channel_history row, got %', (after_count - before_count);
  END IF;
END $$;

SELECT ok(true, 'channel_history audit row inserted on channel update');

SELECT * FROM finish();
ROLLBACK;
