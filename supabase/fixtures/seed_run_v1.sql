-- One run, one version (seeds-poc, v1.0.0), staging pointed at it.
WITH ml AS (SELECT id FROM public.model_lines WHERE slug='seeds-poc')
INSERT INTO public.runs(id, model_line_id, status, config_yaml, finished_at, host)
VALUES ('00000000-0000-0000-0000-0000000000aa',
        (SELECT id FROM ml), 'succeeded',
        '{"hyper":"fixture"}'::jsonb, now(), 'fixture')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.versions(id, run_id, model_line_id, semver, metadata,
                            tflite_r2_key, size_bytes, content_hash)
VALUES ('00000000-0000-0000-0000-0000000000bb',
        '00000000-0000-0000-0000-0000000000aa',
        (SELECT id FROM public.model_lines WHERE slug='seeds-poc'),
        '1.0.0',
        jsonb_build_object(
          'class_names', jsonb_build_array('apple','apple_spot','banana','banana_spot','orange','orange_spot'),
          'input_size', 640,
          'output_kind', 'end2end_nms_free',
          'task', 'segment'
        ),
        'fixtures/seeds-poc-1.0.0.tflite',
        12345, 'sha256:fixture-1.0.0')
ON CONFLICT (id) DO NOTHING;

UPDATE public.channels
SET current_version_id = '00000000-0000-0000-0000-0000000000bb',
    updated_by = '00000000-0000-0000-0000-000000000000'
WHERE name = 'staging'
  AND model_line_id = (SELECT id FROM public.model_lines WHERE slug='seeds-poc');
