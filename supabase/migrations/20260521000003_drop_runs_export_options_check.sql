-- Reverting the earlier CHECK constraint: with the corrected "quantize-only" semantics,
-- both iOS and Android can be unquantized (both checkboxes off), which still produces
-- valid FP32 artifacts. The original constraint incorrectly forbade this state.
alter table public.runs
  drop constraint if exists runs_export_options_min_one_platform;
