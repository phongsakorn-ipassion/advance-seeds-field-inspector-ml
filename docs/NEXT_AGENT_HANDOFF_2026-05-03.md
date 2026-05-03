# Next Agent Hand-off — 2026-05-03

**Repo:** `/Users/ppungpong/Github/advance-seeds-field-inspector-ml`
**Live URL:** https://phongsakorn-ipassion.github.io/advance-seeds-field-inspector-ml/
**Local dev:** http://localhost:5173/ (run `npm run dev` in `apps/web/`)
**Supabase project:** `gqsxiohxokgwwugeoxmy` (shared with `advance-seeds-field-inspector-demo`)
**Local secrets:** `~/.env.advance-seeds` (chmod 600, never commit)

---

## What works end-to-end (validated this session)

The full Colab training path is wired and proven on Tesla T4:

1. **Dashboard form** → operator submits run via the Train tab (form clears on submit, redirects to Live tracking).
2. **Supabase row** inserted in `runs` (status: running) with `config_yaml` carrying source weights, hyperparameters, dataset reference, optional note.
3. **Open in Colab** opens `notebooks/train_run.ipynb` with `?run_id=<uuid>` propagated.
4. **Notebook flow**:
   - Cell 5: clones the repo + installs `ultralytics`, `supabase`, `pyyaml`.
   - Cell 7: prompts for service-role key (also aliased into `MODEL_REGISTRY_*` env vars).
   - Cell 9: pulls run row + config from Supabase.
   - Cell 10: if `dataset` starts with `datasets/`, downloads YAML from R2 via the `download-dataset` Edge Function and writes it to `configs/<filename>.yaml`. Sanity-checks the resolved image dir.
   - Cell 12 (4b): mounts Drive, unzips `MyDrive/advance-seeds/data/processed/dataset.zip` into `/content/.../data/processed/`. Idempotent.
   - Cell 14: `!python scripts/train_for_run.py --run-id $RUN_ID` — the real training driver.
5. **`scripts/train_for_run.py`**:
   - Pulls run row → builds Ultralytics-compatible config → materializes runtime dataset YAML.
   - **Scans dataset image dirs and PATCHes `runs.config_yaml.dataset_stats` with real counts** (so the dashboard's DATASET IMAGES card flips from `—` to numbers via Realtime).
   - Runs `model.train(...)` with an `on_fit_epoch_end` callback that streams `progress` + per-epoch metrics to `run_metrics` (live progress bar) **and** appends a per-epoch summary line to `runs.config_yaml.logs` (live RUN LOGS panel).
   - On finish: exports calibrated INT8 TF Lite + optimized Core ML → `upload-artifact` Edge Function → R2 → creates `versions` row (semver `1.0.0-<run-id-prefix>`) → `finalize_run` to `succeeded`.

The dashboard reflects all of this via Supabase Realtime in near-real-time.

## Recent UX work (also pushed)

- **De-banana'd**: `statsFromDatasetName` removed; demo fixtures renamed `bananaV1Stats` → `seedsV1Stats`; placeholders generic. Codebase no longer assumes a specific crop.
- **Model lifecycle**: editable version semver with original-semver badge; per-version description (independent of training note); deploy/undeploy combined into per-channel toggles with a confirmation modal; lifecycle action bar moved to bottom of detail with a divider.
- **Train form**: NOTE textarea (carries through to `run.config.note`, surfaced in Live tracking, Recent runs, and Model detail's Run section); empty defaults (no pre-filled banana dataset path); 9 hyperparameters (batch / lrf / copyPaste behind an Advanced disclosure).
- **Live tracking**: derived `"waiting"` status for runs that have status `running` but no metrics yet; delete affordance on waiting rows with confirmation modal; cleaner row layout (no "mAP pending" / "mask pending" placeholders).
- **Overview Live runs**: filtered to `status === "running"` only.
- **Manual Colab hand-off panel**: 8 explicit steps including Drive-mount snippet, cell-by-cell guidance.
- **Run-name format**: `<dataset>-yyyymmddhhmmss` everywhere.

## Recent infra work (Edge Functions + migrations)

Pushed to `main`:
- `scripts/train_for_run.py` (new)
- `notebooks/train_run.ipynb` (rewritten cells 5/7/10/11/12/14)

**Uncommitted on local tree** (in-progress, intentionally not pushed):
- `supabase/functions/download-dataset/` — new function, deployed to Supabase
- `supabase/functions/upload-artifact/index.ts` — wrapped handler in try/catch so errors include CORS headers
- `supabase/functions/upload-dataset/index.ts` — same try/catch wrap
- `supabase/functions/start-training/`, `training-callback/` — hosted-Modal scaffolding
- `supabase/migrations/20260502000010_runs_provider_job_id.sql` — adds `runs.provider_job_id`
- `supabase/migrations/20260503000001_replica_identity_full.sql` — fixes DELETE under Realtime publication
- `apps/web/src/App.tsx`, `registry/api.ts`, `registry/demoStore.ts`, `registry/supabaseStore.ts` — `deleteRun` API + better error surfacing
- `infra/r2-cors.json` — R2 bucket CORS policy applied via Cloudflare dashboard
- `packages/training-worker/` — Modal worker scaffolding (not yet deployed)
- Various openspec/docs — design notes
- `data/dataset.zip` — local dataset bundle (gitignored via `data/processed/`)

## Manual configuration done (one-time, environment-side)

These are external to the repo but required for the working pipeline:

1. **Supabase function secrets** set in dashboard → Edge Functions → Secrets:
   - `R2_ACCOUNT_ID` (32-hex Cloudflare account id; was previously a `cfat_…` token, fixed mid-session)
   - `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=advance-seeds-models`
2. **R2 bucket CORS policy** applied via Cloudflare dashboard. Source of truth: `infra/r2-cors.json`. Allows `localhost:5173/5174` and the GitHub Pages prod origin to PUT presigned uploads.
3. **REPLICA IDENTITY FULL** applied to `runs`, `run_metrics`, `channels`, `versions` so DELETE works under the Supabase Realtime publication. Source of truth: `supabase/migrations/20260503000001_replica_identity_full.sql`.
4. **Edge Functions deployed**: `upload-artifact`, `upload-dataset`, `download-dataset`, `storage-usage`. The `start-training` and `training-callback` functions are *not yet deployed* — hosted-Modal path is not active.
5. **Dataset zip** at `gdrive:MyDrive/advance-seeds/data/processed/dataset.zip` containing flat `images/{train,val,test}/` and `labels/{train,val,test}/` (no wrapper directory). Notebook expects this exact Drive path.
6. **`apps/web/.env.local`** generated from `~/.env.advance-seeds` (gitignored). Contains `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, model line slug, quota.

## Known limitations / outstanding work

| # | Topic | What's pending | Notes |
|---|---|---|---|
| 1 | **Manual Colab flow hardening** | Keep Colab as the chosen no-extra-cost training path | Improve checklist copy, reduce rerun mistakes, and smoke-test GitHub Pages after each push |
| 2 | **Edge Function source not committed** | `upload-artifact`, `upload-dataset`, `download-dataset` patches deployed but uncommitted | Commit + push when stable to keep source in sync with what's live |
| 3 | **Hosted Modal training parked** | Worker scaffolding exists, but do not activate unless the user accepts Modal GPU cost | Leave `TRAINING_PROVIDER_*` secrets unset so `start-training` falls back to manual run creation |
| 4 | **Dataset image upload via dashboard** | Intentionally deferred; image bundles still live on Drive | User excluded this from current priority. Revisit only when Drive hand-off becomes painful |
| 5 | **Openspec changes** | `connect-dashboard-to-live-registry/` and `wire-dashboard-to-hosted-training/` have edits not archived | Run `openspec archive` interactively after user reviews |
| 6 | **Browser smoke test on prod** | GitHub Pages deployment hasn't been re-validated since recent UX overhaul | Click through: sign in, train, deploy, storage cleanup |
| 7 | **Mobile responsiveness pass** | Detail panels and lifecycle action bar weren't tested on narrow viewports | Visual QA |
| 8 | **`data/dataset.zip` left in repo root** | Untracked but present | User should delete or move to a more appropriate location |
| 9 | **`replica-identity-full` migration not yet committed** | Migration file exists on disk; was applied via psql | Commit it so the next operator's psql apply matches what's live |

### 2026-05-03 continuation note

- `packages/training-worker/src/advance_seeds_training_worker/modal_app.py`
  now includes the missing Modal HTTP adapter: `POST /runs` validates the
  provider bearer token, spawns the GPU `train` function asynchronously, and
  returns the Modal function-call id as `provider_job_id`.
- The Modal image mount now excludes local caches/build artifacts (`.git/`,
  `.venv/`, `.worktrees/`, `.playwright-mcp/`, `apps/web/node_modules/`,
  `apps/web/dist/`, `data/`, `runs/`) so deploy does not upload the local
  workspace junk or dataset bundle.
- `docs/hosted-training.md` now has the concrete Modal secret/deploy commands.
- Verified live Supabase state: `start-training` and `training-callback` are
  already ACTIVE, but Supabase secrets do not include
  `TRAINING_PROVIDER_BASE_URL`, `TRAINING_PROVIDER_API_KEY`, or
  `TRAINING_CALLBACK_SECRET`. A service-role probe to `start-training` returns
  `hosted_training_not_configured` before creating a run.
- Local `.env.advance-seeds` does not currently contain Modal credentials
  (`MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`) or provider secret values, so Modal
  deployment and a real hosted run remain blocked on credentials/configuration.

## Operational constraints (don't break these)

- **Browser only sees anon key + RLS.** Service-role and R2 secrets stay in Edge Functions or `~/.env.advance-seeds`. Never inline a service-role key in client code or commit it.
- **The Supabase project is shared** with `advance-seeds-field-inspector-demo`. Apply migrations via raw SQL (`psql`), not the Supabase CLI tracker (which would diverge between repos).
- **Don't revoke INSERT/UPDATE/DELETE from `authenticated`.** RLS is the gate; verb privileges are required for RLS to even consider the row. See `supabase/migrations/20260502000008_grant_writes_to_authenticated.sql`.
- **Don't remove tables from `supabase_realtime` publication.** Migration `20260502000009_realtime_publication.sql` exists for a reason — without it, the dashboard never sees live updates.
- **Don't commit `~/.env.advance-seeds` or `apps/web/.env.local`.** Both are gitignored; verify before staging.

## Validation commands

```bash
# Web
cd apps/web && npm run build              # tsc + vite

# Python
python3 -m unittest discover -s tests

# Edge Functions (Deno)
deno check supabase/functions/upload-dataset/index.ts
deno check supabase/functions/upload-artifact/index.ts
deno check supabase/functions/download-dataset/index.ts
deno check supabase/functions/storage-usage/index.ts

# OpenSpec
openspec validate --all --strict

# DB sanity (replica identity)
PGURL="postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.${SUPABASE_PROJECT_REF}.supabase.co:5432/postgres"
psql "$PGURL" -c "SELECT relname, relreplident FROM pg_class WHERE relname IN ('runs','run_metrics','channels','versions') AND relnamespace='public'::regnamespace;"
# Expect 'f' (full) for all four
```

## Browser smoke test (manual)

1. Open http://localhost:5173/, sign in as the admin account.
2. Train tab → upload `configs/dataset.banana-v2.yaml` (or paste path) → Create training run.
3. Form clears, redirects to Live tracking; new row shows status `waiting` (or `running` if metrics already arrived).
4. Click row → detail panel opens with Manual Colab hand-off steps.
5. *(Optional, requires Colab)* Click Open in Colab → Run all → watch progress + logs stream.
6. Models tab → verify lifecycle toggles + confirmation modal work.
7. Storage tab → verify quota display + status pills.
