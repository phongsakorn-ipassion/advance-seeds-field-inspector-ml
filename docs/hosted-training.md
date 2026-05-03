# Hosted Training Setup

> Status: parked. The current operating choice is manual Colab training to avoid
> adding Modal GPU cost. Keep these notes for a future paid hosted-training
> upgrade, but do not configure the provider secrets unless that decision
> changes.

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
  TFLite artifact via `upload-artifact`, then emits a signed success callback.

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

The worker can consume a local/path-like dataset YAML, a public HTTPS dataset
YAML, or `dataset_url` supplied in the config. Full unattended hosted training
still needs the dashboard to upload image zips and pass a presigned dataset
bundle URL. That is the next follow-up after the hosted trigger foundation.

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
