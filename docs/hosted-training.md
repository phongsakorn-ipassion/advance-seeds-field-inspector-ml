# Hosted Training Setup

> Status: parked. The current operating choice is manual Colab training to avoid
> adding Modal GPU cost. Keep these notes for a future paid hosted-training
> upgrade, but do not configure the provider secrets unless that decision
> changes.
>
> Demo decision: no real deployed-dashboard hosted training run is required
> while hosted training remains parked. Manual Colab remains the active path.

This document covers the `wire-dashboard-to-hosted-training` path. It keeps all
provider credentials in Supabase Edge Functions and keeps the browser on the
anon key plus RLS boundary.

## Pieces

- `supabase/functions/start-training`: admin-gated function that creates a
  `runs` row, dispatches the hosted provider, and stores `provider_job_id`.
- `supabase/functions/training-callback`: HMAC-gated function that receives
  worker events and writes `run_metrics`, logs, final `versions`, and run
  status.
- `packages/training-worker`: Python worker package. The Modal app entrypoint
  wraps `scripts/train_yolo26n_seg.py`, streams logs/metrics, uploads the final
  TF Lite, Core ML, and original non-quantized PyTorch `.pt` artifacts via
  `upload-artifact`, then emits a signed success callback.

## Supabase Secrets

Set these in the shared Supabase project:

```bash
source /Users/ppungpong/.env.advance-seeds
supabase secrets set \
  TRAINING_PROVIDER_BASE_URL=<provider-adapter-url> \
  TRAINING_PROVIDER_API_KEY=<provider-api-key> \
  TRAINING_CALLBACK_SECRET=<random-32-plus-byte-secret>
```

`TRAINING_CALLBACK_SECRET` must match the secret passed to the worker. Do not
prefix any of these with `VITE_`; they must never be bundled into the dashboard.

## Modal Worker

The default worker target is Modal. Deploy the app from the repo root:

```bash
python3 -m pip install "./packages/training-worker[modal]"
modal secret create advance-seeds-training-worker \
  PROVIDER_API_KEY=<provider-api-key> \
  MODEL_REGISTRY_URL=https://gqsxiohxokgwwugeoxmy.supabase.co \
  MODEL_REGISTRY_SERVICE_ROLE_KEY=<service-role-key>
modal deploy packages/training-worker/src/advance_seeds_training_worker/modal_app.py
```

The Modal app exposes:

- `POST /runs` on the deployed `api` web endpoint. This is the
  `TRAINING_PROVIDER_BASE_URL` value for Supabase.
- A GPU-backed `train` function. The web endpoint spawns this function and
  returns the Modal function-call id as `provider_job_id` immediately, so the
  Supabase Edge Function is not blocked for the full training duration.
- `GET /health` for a simple provider readiness check.

The worker expects:

```bash
MODEL_REGISTRY_URL=https://gqsxiohxokgwwugeoxmy.supabase.co
MODEL_REGISTRY_SERVICE_ROLE_KEY=<service-role-key>
PROVIDER_API_KEY=<provider-api-key>
```

The callback writes `versions.tflite_r2_key`, `versions.mlmodel_r2_key`, and
`versions.pytorch_r2_key`. The `.pt` artifact is for local segmentation checks;
mobile listing and channel resolution still serve only Android TF Lite or iOS
Core ML packages.

## Manual Colab Local QA Artifact

The active training path is the dashboard-created run plus
`notebooks/train_run.ipynb`. The notebook resets the Colab checkout to
`origin/main`, prints the synced git SHA, and runs `scripts/train_for_run.py`.
The script now fails the run instead of registering a successful version if
`best.pt`/`last.pt` cannot be found, if the uploaded R2 key is not a `.pt`, or
if `metadata.artifacts.pytorch` does not match `versions.pytorch_r2_key`.

If a version was created by an older Colab checkout before the Local QA upload
ran, repair it from the same Colab runtime while `best.pt` still exists:

```bash
python3 scripts/backfill_pytorch_artifact.py \
  --semver 1.0.0-394a0834 \
  --weights /content/advance-seeds-field-inspector-ml/runs/data-20260506105130/weights/best.pt
```

The backfill uploads that file through `upload-artifact`, patches
`versions.pytorch_r2_key`, records `metadata.artifacts.pytorch` as fp32/no
quantization, and appends a run log line. If the Colab runtime is gone and no
local `best.pt`/`last.pt` remains, retraining is required because the registry
only has the quantized mobile artifacts.

## 2026-05-06 Deployment Note

The linked Supabase project `gqsxiohxokgwwugeoxmy` has the local-QA artifact
schema applied with:

```sql
alter table public.versions add column if not exists pytorch_r2_key text;
```

The `upload-artifact`, `download-artifact`, `storage-usage`, and
`training-callback` Edge Functions were deployed after the `.pt` artifact
rollout. A future migration-history cleanup is still needed because the remote
project contains older migration versions that are not present in this checkout.

The provider adapter called by `start-training` must expose:

```text
POST /runs
```

Request body:

```json
{
  "run_id": "...",
  "config": { "dataset": "...", "source_weights": "...", "hyperparameters": {} },
  "callback_url": "https://.../functions/v1/training-callback",
  "callback_secret": "..."
}
```

Response body:

```json
{ "provider_job_id": "..." }
```

`job_id` or `id` are also accepted for provider compatibility.

## Dataset Boundary

The dashboard requires both the dataset YAML and dataset image ZIP before run
creation. Manual Colab downloads the YAML and, when the bundle is an R2 dataset
key, `scripts/train_for_run.py` downloads and extracts the ZIP before training.

The dashboard no longer stores a Colab accelerator choice. Any runtime/GPU
selection is made in Colab or the hosted worker environment itself.

Final version metadata stores normalized model-quality metrics in
`metadata.metrics` (`map50`, `map5095`, `precision`, `recall`, and mask
equivalents) and preserves raw Ultralytics metric names under
`metadata.metrics.raw`.

## Validation

From repo root:

```bash
deno test supabase/functions/training-callback/callback.test.ts
python3 -m unittest discover -s tests
openspec validate --all --strict
```

From `apps/web`:

```bash
npm run build
```
