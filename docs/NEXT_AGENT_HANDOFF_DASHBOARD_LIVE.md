# Next Agent Hand-off — Dashboard live, hosted training foundation added

**Date:** 2026-05-02
**Repo:** `/Users/ppungpong/Github/advance-seeds-field-inspector-ml`
**Live URL:** https://phongsakorn-ipassion.github.io/advance-seeds-field-inspector-ml/
**Supabase project:** `gqsxiohxokgwwugeoxmy` (shared with `advance-seeds-field-inspector-demo`)

---

## Current State

The Advance Seeds model registry dashboard is live on GitHub Pages and wired
to the shared Supabase project. The browser uses Supabase Auth, the anon key,
RLS, and Realtime only. Service-role and R2/provider secrets remain outside
the browser bundle.

The dashboard now includes:

- Supabase Auth admin gate via `app_metadata.role = "admin"`.
- Realtime subscriptions for `runs`, `run_metrics`, `channels`, and
  `versions`.
- Train screen with left sub-nav: Train new model, Live tracking, Recent runs.
- Sliding run detail panel with Colab hand-off steps and an `Open in Colab`
  button. The button tooltip explains that Colab does not auto-run; the user
  must click Runtime, Run all and paste the service-role key when prompted.
- Dataset YAML upload to R2, class parsing from YAML, and dataset split
  display for training, validation, and testing.
- Recent training run rows now show run status as a centered status pill,
  matching the Storage control status style.
- Model lifecycle screen with:
  - label revised from `Model CRUD` to `Model lifecycle`;
  - channel filters without the word `only`;
  - performance/staging sorting;
  - dataset totals/splits;
  - info icons on model detail sections;
  - compact icon-only lifecycle actions in the model detail header.
- Storage control with 512 MB quota display, centered status pills, and
  `Delete model` for inactive records. Deleting an inactive storage record also
  deletes the associated model version metadata.
- Demo/local mode persistence via `localStorage`, so CRUD changes survive
  refresh when Supabase env vars are not configured.

Design DNA remains vendored from `advance-seeds-field-inspector-demo`:
deep-teal brand, light-mode tokens in `apps/web/src/tokens.css`, sticky topbar
shell, and Sprout brand mark.

---

## Hosted Training Foundation

The `wire-dashboard-to-hosted-training` OpenSpec change is no longer just
scoped; the foundation is implemented locally.

Implemented:

- `supabase/migrations/20260502000010_runs_provider_job_id.sql`
  adds `provider_job_id text` to `public.runs`.
- `supabase/functions/start-training/`
  admin-gated Edge Function that inserts a run, calls a provider adapter, and
  stores `provider_job_id`.
- `supabase/functions/training-callback/`
  HMAC-verified callback that handles metric, log, succeeded, and failed
  events.
- `packages/training-worker/`
  Python worker package with Modal-oriented entrypoint, callback client, log
  streaming, artifact upload, and CPU smoke-test coverage.
- `docs/hosted-training.md`
  setup notes for Supabase secrets and the provider adapter contract.
- `apps/web/src/registry/supabaseStore.ts`
  `startTraining` now calls the `start-training` Edge Function and surfaces
  provider errors inline.

Still pending:

- Set Supabase function secrets:
  - `TRAINING_PROVIDER_API_KEY`
  - `TRAINING_PROVIDER_BASE_URL`
  - `TRAINING_CALLBACK_SECRET`
- Deploy/configure the actual Modal/provider adapter.
- Trigger a real training job from the deployed dashboard and verify live
  metrics, final candidate version, and R2 artifact.
- Extend dataset upload to include image zip/bundle delivery, not only YAML.

---

## R2 / Storage Caveat

The dashboard quota is set to 512 MB (`536870912` bytes). `storage-usage GET`
works because it reads Supabase metadata.

Be careful with R2 runtime writes/deletes:

- The earlier handoff noted `R2_ACCOUNT_ID` was mis-set to a Cloudflare API
  token (`cfat_...`) rather than the 32-hex account id. Verify this before
  relying on `upload-artifact`, `upload-dataset`, or `storage-usage/delete`.
- Rotate the Cloudflare R2 token before production use; it was never committed
  but briefly existed in a gitignored local file.
- `storage-usage/delete` now clears stale `channel_history` references before
  deleting an inactive `versions` row, so historical audit references should
  not block inactive model deletion.

---

## Important Files

- `docs/NEXT_AGENT_HANDOFF_DASHBOARD_LIVE.md`
- `docs/NEXT_AGENT_HANDOFF_MODEL_REGISTRY.md`
- `docs/hosted-training.md`
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/registry/{api,demoStore,supabaseStore,index,types}.ts`
- `openspec/changes/connect-dashboard-to-live-registry/`
- `openspec/changes/wire-dashboard-to-hosted-training/`
- `supabase/functions/{start-training,training-callback,storage-usage,upload-artifact,upload-dataset}/`
- `supabase/migrations/20260502000008_grant_writes_to_authenticated.sql`
- `supabase/migrations/20260502000009_realtime_publication.sql`
- `supabase/migrations/20260502000010_runs_provider_job_id.sql`
- `packages/training-worker/`
- `tests/test_training_worker.py`
- `notebooks/train_run.ipynb`
- `scripts/train_yolo26n_seg.py`
- `src/advance_seeds_ml/registry/`

---

## Local Credentials

Use `/Users/ppungpong/.env.advance-seeds` (chmod 600). Source it before
running `supabase`, `psql`, or `gh` commands. Do not commit it or paste its
contents into docs.

The Supabase project is shared with `advance-seeds-field-inspector-demo`.
Apply DB migrations with psql/raw SQL, not the Supabase CLI migration tracker.

Do not revoke `INSERT/UPDATE/DELETE` from the `authenticated` role on registry
tables. Migration `20260502000008_grant_writes_to_authenticated.sql` explains
why: RLS is the gate, but Postgres still needs verb privileges.

Do not remove registry tables from `supabase_realtime`. Migration
`20260502000009_realtime_publication.sql` fixed the silent-failure mode where
the dashboard never saw live updates.

---

## Validation

Before push, run from repo root:

```bash
python3 -m unittest discover -s tests
openspec validate --all --strict
```

From `apps/web`:

```bash
npm run build
```

Useful targeted checks:

```bash
deno check supabase/functions/storage-usage/index.ts
deno test supabase/functions/training-callback/callback.test.ts
```

`supabase/functions/storage-usage/index.test.ts` is an integration test that
expects local Supabase Functions at `127.0.0.1:54321`; it fails with connection
refused unless the local Supabase stack is running.

Browser smoke test:

1. Open https://phongsakorn-ipassion.github.io/advance-seeds-field-inspector-ml/
2. Sign in as the admin account.
3. Overview loads.
4. Train -> create a training run.
5. Live tracking / Recent runs show the run.
6. Click row -> detail slides in.
7. Confirm `Open in Colab` is present and the manual checklist is visible.
8. Models -> verify filters/sorts and icon lifecycle buttons.
9. Storage -> verify status pills are centered and inactive rows say
   `Delete model`.

---

## Highest-impact Remaining Work

1. Configure the hosted training provider secrets and provider adapter, then
   trigger a real hosted run from the deployed dashboard.
2. Verify/fix `R2_ACCOUNT_ID` and rotate R2 credentials.
3. Add dataset image zip/bundle upload and worker/Colab materialization.
4. Close the `notebooks/train_run.ipynb` TODO for fetching R2 datasets.
5. Run `openspec archive` interactively for completed changes once the user is
   ready.
6. Do a browser QA pass on desktop and mobile after the latest UI refinements.

---

## Pasteable Prompt for the Next AI

```text
You are working in:
/Users/ppungpong/Github/advance-seeds-field-inspector-ml

Goal:
Continue the Advance Seeds model registry web app. Read
docs/NEXT_AGENT_HANDOFF_DASHBOARD_LIVE.md in full first, then skim
docs/NEXT_AGENT_HANDOFF_MODEL_REGISTRY.md and the active OpenSpec changes.

Current state:
The dashboard is live at
https://phongsakorn-ipassion.github.io/advance-seeds-field-inspector-ml/ and
uses the shared Supabase project. Auth, RLS, Realtime, deploy/undeploy,
storage quota, inactive model deletion, dataset YAML upload, demo persistence,
Train UI guidance, Model lifecycle filters/actions, and Storage UI polish are
implemented. Hosted training foundation is also implemented locally:
provider_job_id migration, start-training Edge Function, training-callback Edge
Function, Python training-worker package, and docs/hosted-training.md.

Highest-impact next work:
1. Configure and verify hosted training end-to-end:
   - set TRAINING_PROVIDER_API_KEY, TRAINING_PROVIDER_BASE_URL, and
     TRAINING_CALLBACK_SECRET as Supabase function secrets;
   - deploy/configure the Modal/provider adapter;
   - start a real run from the deployed dashboard and verify live metrics,
     final version row, and R2 artifact.
2. Verify/fix R2_ACCOUNT_ID. It may still be a Cloudflare API token instead of
   the 32-hex account id. Rotate R2 credentials before production use.
3. Extend dataset upload to include the image zip/bundle, not just YAML, and
   make both hosted worker and Colab notebook fetch/materialize it.
4. Close the notebook TODO for R2 dataset fetch.
5. Browser QA desktop/mobile after the latest UI changes.

Required approach:
- Follow OpenSpec. Any new behavior should update or add an OpenSpec change
  with proposal.md, design.md, tasks.md, and requirements spec.
- Keep service-role, R2, and provider secrets out of the browser bundle.
- Browser uses anon key + RLS only.
- The Supabase project is shared with advance-seeds-field-inspector-demo.
  Apply migrations via psql/raw SQL, not the Supabase CLI migration tracker.
- Do not revoke authenticated table verbs; RLS is the authorization gate.
- Do not remove registry tables from supabase_realtime.
- Do not commit /Users/ppungpong/.env.advance-seeds.

Validation before push:
From repo root:
  python3 -m unittest discover -s tests
  openspec validate --all --strict
From apps/web:
  npm run build
Useful targeted:
  deno check supabase/functions/storage-usage/index.ts
  deno test supabase/functions/training-callback/callback.test.ts
```
