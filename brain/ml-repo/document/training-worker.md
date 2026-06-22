---
project: ml-repo
type: reference
status: active
tags: [worker, modal, training, fastapi]
created: 2026-06-22
updated: 2026-06-22
sources: [packages/training-worker/src/advance_seeds_training_worker/, packages/training-worker/pyproject.toml]
canonical: false
---

# Hosted training worker (Modal)

> [!abstract] TL;DR
> A Modal GPU function (T4, 1h timeout) that trains YOLO26n-seg remotely, streams
> metrics/logs via HMAC-signed callbacks, uploads artifacts to R2, and reports
> completion. The Modal/FastAPI deps live behind the `[modal]` extra.

## Pieces (`packages/training-worker/src/advance_seeds_training_worker/`)
- `modal_app.py` — `modal.App`; the `train()` GPU function + a FastAPI `api()` with
  `GET /health` and `POST /runs` (token-auth → `train.spawn()` → `{provider_job_id}`).
- `runner.py` — `HostedTrainingWorker.run()`: write training config, spawn
  `scripts/train_yolo26n_seg.py --no-auto-hardware`, stream + parse stdout, resolve
  artifact paths (newest by mtime), `upload_artifact()` → R2, fire the callback.
- `callbacks.py` — `CallbackClient`: posts `metric`/`log`/`succeeded`/`failed` events with
  `x-training-signature: sha256=…` (HMAC over canonical JSON).

## Invariants
- Secrets from `modal.Secret.from_name("advance-seeds-training-worker")`:
  `MODEL_REGISTRY_URL`, `MODEL_REGISTRY_SERVICE_ROLE_KEY`, provider API key.
- Config accepts camelCase or snake_case (`datasetUrl`/`dataset_url`, …).
- Base package only needs PyYAML (keeps the [[python-registry-sdk]] light); `[modal]`
  adds `modal` + `fastapi`.

## Gotchas / footguns
> [!warning] `POST /runs` spawns async and returns a job id — there is **no** status-poll
> or cancel endpoint here; the caller polls elsewhere.

> [!warning] Worker uses Ultralytics export **defaults** (FP32) — per-platform
> quantization lives only in the Colab `train_for_run.py` path. See [[training-driver]].

> [!warning] Callbacks are fire-and-forget; an unreachable callback URL fails silently
> while training continues.

## Related
- [[training-driver]] · [[python-registry-sdk]] · [[edge-functions]] (training-callback)
