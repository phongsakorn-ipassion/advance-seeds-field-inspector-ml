# Design — Select YOLO26n-seg

## Context

The user selected the YOLO26n model family and linked the official Ultralytics
YOLO26 documentation. That page documents `yolo26n-seg.pt` as the nano
instance-segmentation checkpoint, support for training/validation/export, and
YOLO26's native end-to-end NMS-free inference path with `(N, 300, 6)` detection
output for the one-to-one head.

## Decisions

### D1. Use `yolo26n-seg.pt` as the source model

The ML repo targets instance segmentation, so the selected checkpoint is
`yolo26n-seg.pt`, not detection-only `yolo26n.pt`. This preserves mask output
for per-seed measurement.

### D2. Prefer YOLO26 end-to-end export

The default export metadata uses `output_kind: end2end_nms_free` and
`output_shape: [1, 300, 6]`. This matches the app's existing decoder support for
YOLO26 NMS-baked/end-to-end output and avoids adding app-side NMS unless a later
change explicitly selects the one-to-many head.

### D3. Keep app filename compatibility

The consuming app currently loads `yolo11n-seeds.tflite`. Renaming that asset
requires a coordinated app change, so this ML repo will export/copy YOLO26n
weights into the existing filename and record the real source model in
`model-metadata.json`.

## File Updates

- `README.md`
- `models/README.md`
- `docs/app-handoff.md`
- `configs/model_export_contract.json`
- `scripts/write_model_metadata.py`
- `src/advance_seeds_ml/contracts.py`
- `openspec/config.yaml`
- `openspec/specs/segmentation-training/spec.md`
- `openspec/specs/mobile-model-export/spec.md`

## Validation

- `python3 -m unittest discover -s tests`
- `python3 scripts/write_model_metadata.py ...`
- `openspec validate --all --strict`
