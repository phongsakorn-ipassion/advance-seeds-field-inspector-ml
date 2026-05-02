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
