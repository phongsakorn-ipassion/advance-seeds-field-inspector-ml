# add-dashboard-export-nms-controls

## Why
The iOS Core ML and Android TFLite artifacts shipped today only return one
detection per frame because `scripts/train_for_run.py::export_kwargs` does
not pass `nms / max_det / iou / conf` to Ultralytics' `model.export(...)`.
Operators cannot fix this from the dashboard; the only knob exposed is
`quantize` per platform. We need first-class NMS controls.

## What changes
- Dashboard "Train new model" form gains a Detection limits block per
  platform: `max_det`, `iou`, `conf`. Always visible (mirrors Quantization),
  with summary chips and a Reset-to-defaults action.
- `ExportTarget` type gains an optional `nms` block.
- `start-training` Edge Function validates the new fields before insert.
- `training-callback` Edge Function surfaces resolved options in version
  metadata.
- `scripts/train_for_run.py::export_kwargs` injects NMS params into both
  Core ML and TFLite export kwargs.
- `scripts/export_mobile_model_candidates.py` accepts matching CLI flags.

## Impact
- New: `apps/web/src/registry/exportOptions.ts`,
  `supabase/functions/_shared/exportOptions.ts`,
  `openspec/changes/add-dashboard-export-nms-controls/*`
- Modified: web registry types/stores/UI/CSS, both Edge Functions, two
  Python scripts, Python + Vitest test files.
- Not impacted: artifact filename contract, `model_export_contract.json`
  output_kind/shape (deferred), demo repo, hosted-Modal worker (separate
  bug).
