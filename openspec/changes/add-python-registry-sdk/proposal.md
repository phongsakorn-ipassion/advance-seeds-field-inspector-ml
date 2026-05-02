## Why

Training currently produces local run outputs, but the model registry backend
does not yet receive run records, metrics, or artifact upload requests from
Python. Adding a small SDK lets training and export scripts report model
versions to the registry without embedding HTTP/R2 details in those scripts.

## What Changes

- Add a Python registry client under `src/advance_seeds_ml/registry/`.
- Load registry settings from environment variables without committing secrets.
- Support creating runs, logging metrics, finalizing runs, requesting artifact
  upload URLs, and registering versions through the Supabase backend.
- Add focused unit tests using standard-library fakes so the SDK remains
  testable without a live Supabase project.
- Do not change mobile app behavior or build the web dashboard in this change.

## Capabilities

### New Capabilities

- `python-registry-sdk`: Python training scripts can report runs, metrics, and
  model versions to the model registry backend.

### Modified Capabilities

- `segmentation-training`: Training may optionally report run lifecycle and
  metrics to the model registry when registry settings are configured.

## Impact

- New Python package module: `src/advance_seeds_ml/registry/`.
- Tests under `tests/test_registry.py`.
- Optional CLI flags or environment-driven integration in
  `scripts/train_yolo26n_seg.py`.
- Uses the existing Supabase REST and Edge Function contract; no new backend
  tables or mobile app API changes.

## Non-goals

- No web dashboard implementation.
- No mobile OTA client implementation.
- No training orchestration or remote job launching.
- No direct Cloudflare R2 credentials in Python; artifact uploads use signed
  URLs returned by the backend.
