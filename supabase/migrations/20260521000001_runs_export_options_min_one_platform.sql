-- Reject run rows where both iOS and Android exports are explicitly disabled.
-- Rows without an exportOptions field (legacy / manual runs) are allowed through.
ALTER TABLE runs
  ADD CONSTRAINT runs_export_options_min_one_platform
  CHECK (
    config_yaml->'exportOptions' IS NULL
    OR (config_yaml->'exportOptions'->'ios'->>'enabled')::boolean = true
    OR (config_yaml->'exportOptions'->'android'->>'enabled')::boolean = true
  );
