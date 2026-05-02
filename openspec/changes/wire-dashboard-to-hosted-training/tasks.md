## 1. OpenSpec

- [ ] 1.1 Add proposal, design, and requirements for hosted training trigger.
- [ ] 1.2 Validate the change with `openspec validate --all --strict`.

## 2. Schema

- [ ] 2.1 Add migration adding `provider_job_id text` to `public.runs`.
- [ ] 2.2 Apply migration to the live shared Supabase project via psql.

## 3. Edge Functions

- [ ] 3.1 Add `supabase/functions/start-training/index.ts` that verifies
      admin JWT, inserts the run row, calls the provider, and returns
      `{ run_id, provider_job_id }`.
- [ ] 3.2 Add `supabase/functions/training-callback/index.ts` that
      HMAC-verifies the body, dispatches on `type`
      (`metric`/`log`/`succeeded`/`failed`), and writes Supabase rows.
- [ ] 3.3 Add unit tests for HMAC verification and dispatch shape.

## 4. Worker

- [ ] 4.1 Add `packages/training-worker/` Python package with a Modal
      entrypoint that wraps `scripts/train_yolo26n_seg.py`.
- [ ] 4.2 Implement per-epoch metric callbacks and batched log forwarding.
- [ ] 4.3 Implement final artifact upload through `upload-artifact` and
      `succeeded` callback emission.
- [ ] 4.4 Add a smoke test runnable on a CPU (1 image, 1 epoch) so CI does
      not need a GPU.

## 5. Dashboard

- [ ] 5.1 Rewire `supabaseStore.startTraining` to call the
      `start-training` Edge Function instead of inserting directly.
- [ ] 5.2 Update the boundary explainer card on the Train pipeline to
      describe the hosted path.
- [ ] 5.3 Surface provider errors in the form (toast or inline error).

## 6. Secrets / Ops

- [ ] 6.1 Set `TRAINING_PROVIDER_API_KEY`, `TRAINING_PROVIDER_BASE_URL`,
      and `TRAINING_CALLBACK_SECRET` as Supabase function secrets.
- [ ] 6.2 Document the setup steps in `docs/hosted-training.md`.

## 7. Validation

- [ ] 7.1 Run `npm run build` in `apps/web`.
- [ ] 7.2 Run `python3 -m unittest discover -s tests`.
- [ ] 7.3 Run `openspec validate --all --strict`.
- [ ] 7.4 Trigger a real training from the deployed dashboard and verify
      live metrics, final candidate version, and R2 artifact appear.
