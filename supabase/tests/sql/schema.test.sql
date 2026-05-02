\set ON_ERROR_STOP on

-- model_lines
SELECT count(*) AS expected_one
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'model_lines';

SELECT slug FROM public.model_lines WHERE slug = 'seeds-poc';
