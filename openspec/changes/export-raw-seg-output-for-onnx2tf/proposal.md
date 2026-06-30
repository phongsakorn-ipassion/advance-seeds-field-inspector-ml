# export-raw-seg-output-for-onnx2tf

## Why
The only YOLO26-seg head that `onnx2tf` can convert to TFLite is the one-to-many
head (`end2end=False`), which emits **raw** detections `[1, 4+nc+32, 8400]` plus
mask prototypes `[1, 32, 160, 160]`. NMS is Detect-only in Ultralytics >=8.4.83
(the `litert` exporter hard-rejects `nms`), and was silently ignored for
segmentation even before that. So the previous contract — `output_kind:
"segmentation"`, `output_shape: [1, 300, 38]`, NMS applied at export, app runs no
NMS — is **not achievable** for a convertible seg TFLite. The exported metadata
must tell the app the truth so it can run NMS + mask assembly on-device.

See drift-register `D-TFLITE-ONNX2TF`.

## What changes
- New `output_kind` value **`segmentation_raw`**: raw one-to-many head, app runs
  NMS + mask assembly.
- `model-metadata.json` (and the registry version metadata written by the worker)
  carry `output_shape` **derived from the trained class count**
  (`[1, 4+nc+32, 8400]`), plus `nms_applied: false` and
  `mask_proto_shape: [1, 32, 160, 160]`.
- `ModelMetadata` gains optional `nms_applied` (default `true`) and
  `mask_proto_shape` (default `null`) fields; both backward compatible with
  metadata written before this change.
- `configs/model_export_contract.json` updated to the raw-seg contract.
- Export kwargs already drop the Detect-only `nms`/`max_det`/`iou`/`conf` args
  (shipped separately); this change records the resulting contract.

## Impact
- Modified: `src/advance_seeds_ml/contracts.py`, `scripts/write_model_metadata.py`,
  `scripts/export_mobile_model_candidates.py`, `scripts/train_for_run.py`,
  `configs/model_export_contract.json`, contract tests.
- Cross-repo: the demo app's `TfliteSeedAnalyzer` must decode the raw output
  (NMS + mask) — tracked in the demo repo's own change.
- Not impacted: TFLite filename alias, calibration contract, acceptance targets.
