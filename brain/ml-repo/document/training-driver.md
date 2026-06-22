---
project: ml-repo
type: reference
status: active
tags: [training, yolo, ultralytics]
created: 2026-06-22
updated: 2026-06-22
sources: [src/advance_seeds_ml/training.py, scripts/train_yolo26n_seg.py, scripts/train_for_run.py, scripts/train_local_banana.sh]
canonical: true
---

# Training driver (canonical)

> [!abstract] TL;DR
> Configures and launches YOLO26n-seg training. Three entry points share `training.py`:
> local CLI, registry-bound Colab, and a shell bootstrap.

## Entry points
- `scripts/train_yolo26n_seg.py` — local/CI; optional `--registry-report` creates+finalizes
  a run row. No export/quantization logic (Ultralytics defaults).
- `scripts/train_for_run.py` — Colab: fetches the run row from Supabase, materializes the
  dataset (+optional bundle ZIP) from R2, streams per-epoch metrics, exports TFLite/CoreML/
  `.pt`, uploads artifacts, creates the version. **This is the path with quantization +
  export options.**
- `scripts/train_local_banana.sh` — venv bootstrap → validate dataset → `train_yolo26n_seg.py`.

## training.py responsibilities
- `load_training_config` (type-coerces via a `TRAIN_KEYS` whitelist), `apply_overrides`,
  `resolve_training_paths`, `detect_hardware` + `apply_hardware_profile`
  (auto batch/workers/amp/cache for CUDA/MPS/CPU), `materialize_ultralytics_dataset_config`
  (writes an absolute-path runtime YAML to `runs/_runtime_datasets/`), `train_kwargs`.

## Invariants
- `--registry-report` requires `--registry-model-line-id`; the run is created before and
  finalized (`succeeded`/`failed`) after training, even on exception.
- PyTorch artifact is always FP32; TFLite/CoreML honor per-platform quantize flags;
  failed exports record `precision: "failed"` and still create the version.
- Default export NMS: `{ maxDet:300, iouThreshold:0.7, confThreshold:0.25 }`.

## Gotchas / footguns
> [!warning] `materialize_ultralytics_dataset_config` walks **up** parent dirs searching
> for a `data/...` tail — in a nested project it can match an unintended dataset.

> [!warning] Metric capture is regex-over-stdout; if Ultralytics changes its log format,
> metrics silently stop appearing.

> [!warning] The local entry point has **no** export-options support — only the Colab
> (`train_for_run.py`) and worker paths produce mobile artifacts.

## Related
- [[python-registry-sdk]] · [[training-worker]] · [[dataset-pipeline]]
- [[training-to-registry-flow]] · [[mobile-export]]
