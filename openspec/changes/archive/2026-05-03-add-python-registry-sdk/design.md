## Context

Plan 1 added the Supabase model registry backend: `runs`, `run_metrics`,
`versions`, `channels`, `channel_history`, RLS, and Edge Functions for
`resolve-channel` and `upload-artifact`. This repo still trains locally through
`scripts/train_yolo26n_seg.py`, so the next step is a Python-side adapter that
can publish run lifecycle events and artifacts to that backend.

## Goals / Non-Goals

**Goals:**

- Provide a small SDK that hides Supabase REST and Edge Function details from
  training scripts.
- Keep configuration environment-driven and secret-free in Git.
- Use standard-library HTTP by default so the base package does not gain a
  heavyweight dependency.
- Make the training script able to opt in to registry reporting without changing
  normal local training behavior.

**Non-Goals:**

- No dashboard UI, channel promotion UI, or mobile OTA client.
- No remote training orchestration.
- No direct R2 signing or R2 credentials in Python.
- No automatic model export pipeline beyond helper calls for upload and version
  registration.

## Decisions

### SDK layout

Add:

```text
src/advance_seeds_ml/registry/
  __init__.py
  client.py
```

`client.py` owns environment loading, HTTP request helpers, and typed methods.
Keeping this as a small module matches the existing stdlib-heavy project style.

### HTTP dependency

Use `urllib.request` instead of adding `requests` or `supabase-py`.
The SDK needs a narrow subset of behavior: JSON REST calls, Edge Function JSON
calls, and signed PUT upload. A stdlib implementation keeps installation simple
for training hosts and CI.

### Auth

The SDK reads:

- `MODEL_REGISTRY_URL`
- `MODEL_REGISTRY_SERVICE_ROLE_KEY`

The service-role key is for trusted training environments only. It bypasses RLS
for REST inserts and authorizes `upload-artifact`.

### Training integration

`train_yolo26n_seg.py` remains unchanged unless registry reporting is explicitly
enabled through CLI/env. Dry runs do not write to the registry. The initial
integration records run start/final status and leaves richer Ultralytics epoch
callback wiring for a later focused change if needed.

## Risks / Trade-offs

- **Service role key on a training host** -> Keep it only in local `.env` or CI
  secrets and never commit it.
- **Ultralytics callback APIs can drift** -> Start with lifecycle calls around
  training and keep per-epoch metric ingestion as a separately testable helper.
- **HTTP failures could hide training failures** -> Registry errors should fail
  fast when explicitly enabled, while disabled registry mode preserves current
  local behavior.
