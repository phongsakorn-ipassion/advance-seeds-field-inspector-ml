\set ON_ERROR_STOP on

-- Insert a version without compat_signature; trigger should fill it.
WITH ml AS (SELECT id FROM public.model_lines WHERE slug='seeds-poc')
INSERT INTO public.versions(model_line_id, semver, metadata, tflite_r2_key,
                            size_bytes, content_hash)
VALUES (
  (SELECT id FROM ml),
  '0.0.1-test',
  jsonb_build_object(
    'class_names', jsonb_build_array('apple','apple_spot','banana','banana_spot','orange','orange_spot'),
    'input_size', 640,
    'output_kind', 'end2end_nms_free',
    'task', 'segment'
  ),
  'fixtures/test.tflite',
  1024,
  'sha256:fixture'
)
RETURNING compat_signature;

-- Recompute via the helper and assert equality.
SELECT
  (SELECT compat_signature FROM public.versions WHERE semver='0.0.1-test')
    = public.compute_compat_signature(
        ARRAY['apple','apple_spot','banana','banana_spot','orange','orange_spot'],
        640, 'end2end_nms_free', 'segment'
      ) AS match;
