## Why

Today the dashboard is a pure registry: clicking "Start Colab MCP training"
inserts a `runs` row but does not trigger any compute. A stranger landing on
the deployed Pages URL cannot actually train — they would need to clone the
repo, fetch the dataset, and run `scripts/train_yolo26n_seg.py` themselves.

To make the demo self-contained, the dashboard SHALL be able to trigger a
real training job on a hosted GPU service, so admins can produce candidate
versions end-to-end from the browser.

## What Changes

- Add a `start-training` Supabase Edge Function that calls a hosted GPU
  provider (Modal, Replicate, or Beam — picked in design phase) with the
  run id and resolved config, and stores the provider job id on the `runs`
  row.
- Add a `training-callback` Supabase Edge Function that the provider posts
  status + metric updates to. The function authenticates the callback with
  an HMAC shared secret and writes rows into `run_metrics` and updates the
  `runs` row's `status` / `finished_at`.
- Add a worker entrypoint (Python) that pulls the dataset (from R2 or a
  public URL referenced by the run's config), runs YOLO training, streams
  metrics back to the callback URL, then uploads the resulting artifact to
  R2 and posts a final "succeeded" event with the artifact key.
- Wire the dashboard's "Start Colab MCP training" button to call the
  `start-training` Edge Function instead of inserting the run row directly,
  so the registry write and the job dispatch happen atomically.
- Update the explainer card on the Train pipeline to reflect the new
  end-to-end flow and remove the "you need to run the SDK locally" caveat
  for the hosted path.

## Capabilities

### New Capabilities

- `hosted-training-trigger`: Browser-initiated, server-dispatched training
  jobs on a hosted GPU provider with HMAC-authenticated metric callbacks.

### Modified Capabilities

- `model-registry-web-dashboard`: gains a real training trigger; the
  Live tracking panel will receive Realtime metric updates produced by the
  provider's run rather than from a manually-launched local SDK.

## Impact

- Two new Edge Functions: `start-training`, `training-callback`.
- One new worker package under `packages/training-worker/` (Python) that
  the provider invokes.
- New Supabase secrets:
  - `TRAINING_PROVIDER_API_KEY`
  - `TRAINING_PROVIDER_BASE_URL`
  - `TRAINING_CALLBACK_SECRET` (HMAC)
- Dashboard `apps/web/src/registry/supabaseStore.ts` rewires
  `startTraining` to call the Edge Function.
- Provider account + billing is required for the hosted path. Demo mode
  and local-SDK-driven training continue to work unchanged.

## Non-goals

- No multi-tenant queue management. One run at a time per model line.
- No mid-run cancellation from the dashboard (initially). Cancel can land
  in a follow-up change.
- No automatic dataset versioning. The dataset YAML reference is still a
  string; the worker resolves it (typically by fetching from R2) but the
  registry does not track dataset versions.
- No replacement of the Python SDK path. Local training and the Colab MCP
  hand-off remain valid; they just become one of two ways to populate the
  registry.
