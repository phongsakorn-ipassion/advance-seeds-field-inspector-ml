# Design — Dashboard export NMS controls

## Defaults (locked across web + Edge + Python)
- maxDet=300, iouThreshold=0.7, confThreshold=0.25
- Ranges: maxDet ∈ [1,300] int; iou/conf ∈ [0.0,1.0] step 0.05

## UI layout
Below the existing "Quantization" checkbox-group, add a sibling block
"Detection limits". Per platform (iOS, Android) render three labelled
number inputs in one row plus a summary chip beneath that reads
"maxDet=300 · iou=0.70 · conf=0.25" using the same `quantization-option-meta`
typography. A "Reset to defaults" ghost button sits at the right of each
platform row. The whole block is always visible (NOT collapsed) because
the controls materially affect on-device detection behaviour.

## Persistence shape
`runs.config_yaml.exportOptions = { ios: {quantize, nms: {maxDet, iouThreshold, confThreshold}}, android: {...} }`.
`nms` is optional on read; missing `nms` means "use defaults".

## Validation
Done on three layers, all using the same constants from
`_shared/exportOptions.ts`:
1. UI: type=number + min/max/step; error label on blur if out of range.
2. start-training Edge Function: 400 with explicit field name if invalid.
3. Python loader: clamps + logs; never crashes the run.

## Metadata propagation
`training-callback` writes the resolved options into
`version.metadata.export_options` so QA can verify what was actually
sent to Ultralytics.

## Out of scope rationale
- `output_kind/output_shape` reconcile: would break demo decoder
  (`TfliteSeedAnalyzer.ts:163`). Deferred to a separate change that
  must touch the demo repo in lockstep.
- Modal hosted worker: `runner.py` calls `train_yolo26n_seg.py` which
  does not export. Production model came from the Colab path. Hosted
  path is broken independently; this plan keeps it untouched.
