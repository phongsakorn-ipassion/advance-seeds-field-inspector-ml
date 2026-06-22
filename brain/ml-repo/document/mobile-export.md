---
project: ml-repo
type: reference
status: active
tags: [export, tflite, coreml, metadata]
created: 2026-06-22
updated: 2026-06-22
sources: [scripts/export_mobile_model_candidates.py, scripts/write_model_metadata.py, tests/test_export_class_names.py]
canonical: false
---

# Mobile export script

> [!abstract] TL;DR
> `scripts/export_mobile_model_candidates.py` exports named candidate models
> (TFLite + Core ML + the source `.pt`), writes a `model-metadata.json` per the
> [[model-export-contract]], and emits per-candidate manifests with sha256 hashes.

## How it works
- `export_model()` (`scripts/export_mobile_model_candidates.py:74`) loads the model
  with `YOLO(weights)` (`:84`), copies the `.pt`, then exports `tflite` + `coreml`
  with `nms=True, max_det, iou, conf` (`:112`).
- Writes `model-metadata.json` (`:130`) via `ModelMetadata` ([[model-export-contract]]).
- Writes a `manifest.json` (paths, sha256, sizes) per candidate, and a root
  `model-candidates.index.json` listing them.

## Class names are derived from the model (not hardcoded)
`resolve_class_names(model.names, fallback=CLASS_NAMES)` (`:25`) turns the model's
`{index: name}` map into an index-ordered list. The old `CLASS_NAMES` constant
survives only as a fallback. Rationale + tests:
[[0001-derive-export-class-names-from-model]], `tests/test_export_class_names.py`.

> [!tip] Standalone metadata writer: `scripts/write_model_metadata.py --classes ...`
> takes classes as a required CLI arg — already class-agnostic.

## Gotchas
> [!warning] The heavy `from ultralytics import YOLO` lives **inside** `export_model()`,
> not at module top — that's why `tests/test_export_class_names.py` can import the
> module on a CPU-only/CI box without torch. Keep it that way.

## Related
- [[model-export-contract]] (canonical) · [[training-to-registry-flow]] · [[drift-register]]
