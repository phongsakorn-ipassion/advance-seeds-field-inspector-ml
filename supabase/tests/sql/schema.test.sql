\set ON_ERROR_STOP on

-- model_lines
SELECT count(*) AS expected_one
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'model_lines';

SELECT slug FROM public.model_lines WHERE slug = 'seeds-poc';

-- runs status enum guard
SAVEPOINT s1;
DO $$ BEGIN
  PERFORM 1 FROM public.runs;
  -- Try invalid status
  INSERT INTO public.runs(model_line_id, status, config_yaml)
    VALUES ((SELECT id FROM public.model_lines WHERE slug='seeds-poc'),
            'invalid-status', '{}'::jsonb);
  RAISE EXCEPTION 'expected status check to reject invalid value';
EXCEPTION WHEN check_violation THEN
  -- expected
  NULL;
END $$;
ROLLBACK TO SAVEPOINT s1;

-- run_metrics index exists
SELECT 1 FROM pg_indexes
WHERE schemaname='public' AND tablename='run_metrics' AND indexname='run_metrics_run_name_step_idx';

-- Promote: insert a self-contained test version and verify the audit trigger fires.
WITH ml AS (SELECT id FROM public.model_lines WHERE slug='seeds-poc')
INSERT INTO public.versions(model_line_id, semver, metadata, tflite_r2_key, size_bytes, content_hash)
VALUES (
  (SELECT id FROM ml),
  '0.0.1-schema-test',
  jsonb_build_object(
    'class_names', jsonb_build_array('apple'),
    'input_size', 320,
    'output_kind', 'end2end_nms_free',
    'task', 'segment'
  ),
  'fixtures/schema-test.tflite',
  100,
  'sha256:schema-test'
);

WITH ml AS (SELECT id FROM public.model_lines WHERE slug='seeds-poc'),
     v  AS (SELECT id FROM public.versions WHERE semver='0.0.1-schema-test')
UPDATE public.channels
SET current_version_id = (SELECT id FROM v),
    updated_by = '00000000-0000-0000-0000-000000000000'
WHERE model_line_id = (SELECT id FROM ml) AND name = 'staging';

SELECT count(*) AS history_rows
FROM public.channel_history
WHERE to_version_id = (SELECT id FROM public.versions WHERE semver='0.0.1-schema-test');
