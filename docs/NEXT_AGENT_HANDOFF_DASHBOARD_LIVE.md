# Next Agent Hand-off — Dashboard wired to live Supabase + Colab

**Date:** 2026-05-02
**Repo:** `/Users/ppungpong/Github/advance-seeds-field-inspector-ml`
**Branch:** `main` (in sync with `origin/main`)
**Live URL:** https://phongsakorn-ipassion.github.io/advance-seeds-field-inspector-ml/
**Supabase project:** `gqsxiohxokgwwugeoxmy` (shared with `advance-seeds-field-inspector-demo`)

---

## Current State

The dashboard now talks to Supabase end-to-end. Anyone hitting the Pages URL
can sign in and use the registry; the only thing the dashboard cannot do is
actually run YOLO training (that's the next big change — see Remaining work
section 1).

### What works in production right now

- **One-click admin login** as `alex@advanceseeds.com` / `DemoSeeds2026!` (the
  shared admin from the demo project; `app_metadata.role = "admin"`).
- **Train sub-navigation** with three tabs:
  - *Train new model* — full form with hint icons on every field, dataset
    YAML upload to R2, source weights select (yolo26n-seg.pt /
    yolo26s-seg.pt), read-only class chips populated from the uploaded YAML.
  - *Live tracking* — list of running runs with a count badge.
  - *Recent runs* — completed/failed history.
- **Sliding run detail panel** per tab. Click a row → detail slides in below
  with status banner, scrollable terminal-style log, and Info section
  (training config + dataset + hyperparameters key/value grid).
- **Open in Colab** button on the run detail header. Opens
  `notebooks/train_run.ipynb` with `?run_id=<id>`. The notebook resolves the
  run id, prompts for a service-role key, clones the repo, and calls
  `scripts/train_yolo26n_seg.py --run-id ... --report-registry`.
- **Models screen** — version cards, deploy/undeploy/storage cleanup all
  through the Supabase store. Channel writes audit into `channel_history`.
- **Storage screen** — quota banner (512 MB), usage bar, delete-inactive
  routes through the `storage-usage` Edge Function (admin-gated).
- **Realtime** — `runs`, `run_metrics`, `channels`, `versions` are in the
  `supabase_realtime` publication, so the dashboard sees inserts/updates
  within ~1 second.
- **Design DNA mirrored from `advance-seeds-field-inspector-demo`** —
  vendored CSS variables under `apps/web/src/tokens.css`, deep-teal brand,
  light-mode only, Sprout brand mark, sticky topbar shell.

### Backend pieces deployed

- Migrations applied to live DB via psql (the project is shared with the demo
  app, so we bypass the CLI's migration tracker — see
  `connect-dashboard-to-live-registry` for the rationale):
  - `20260502000001_model_lines.sql` … `20260502000007_fix_compat_trigger.sql`
  - `20260502000008_grant_writes_to_authenticated.sql` — re-grants
    INSERT/UPDATE/DELETE to the `authenticated` role; without this, RLS still
    runs but Postgres rejects the verb before RLS sees it (which is what made
    the first "Start training" click 403).
  - `20260502000009_realtime_publication.sql` — adds the four registry tables
    to `supabase_realtime`. The publication is empty by default; without this
    Realtime subscriptions silently observe nothing.
- Edge Functions deployed:
  - `resolve-channel` — public, returns presigned GET URL for a model line's
    current production tflite.
  - `upload-artifact` — admin/service-role, returns presigned PUT URL under
    `runs/{run_id}/{semver}.{ext}`.
  - `upload-dataset` — admin/service-role, returns presigned PUT URL under
    `datasets/{slug}/{stamp}/{filename}` for the dataset YAML.
  - `storage-usage` — `GET` returns `{used_bytes, quota_bytes}`. `POST /delete`
    requires admin and removes a version's R2 objects + the row.
- GitHub Pages workflow `.github/workflows/pages.yml` deploys `apps/web/dist`
  on every push to `main` that touches `apps/web/`.

### Local credentials

`/Users/ppungpong/.env.advance-seeds` (chmod 600, outside the repo) holds:
- `SUPABASE_URL`, `SUPABASE_PROJECT_REF`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`
- `R2_ACCOUNT_ID_NEEDS_FIX` (intentionally renamed; the value pasted by the
  user was a Cloudflare API token, not the 32-hex account id — see Remaining
  work section 2)
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET=advance-seeds-models`,
  `STORAGE_QUOTA_BYTES=536870912`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`

### OpenSpec status

`openspec validate --all --strict` → 18/18 ✓.

| Change | State | Notes |
|---|---|---|
| `add-model-registry-backend` | done | applied |
| `add-python-registry-sdk` | done | |
| `add-model-registry-web-dashboard` | done | |
| `connect-dashboard-to-live-registry` | done | all tasks closed (7.4 verified) |
| `wire-dashboard-to-hosted-training` | **scoped, not implemented** | proposal/design/tasks/spec written, no code |

`openspec archive` is interactive and has not been run. None of the completed
changes are archived.

---

## Remaining Work

### 1. Implement `wire-dashboard-to-hosted-training` *(highest impact)*

This is the change that turns the dashboard from a registry into a usable
self-contained demo. Today, clicking *Start Colab MCP training* inserts a
`runs` row but no compute fires — the operator has to open the Colab notebook
and click Run all manually. The scoped change wires up a hosted GPU provider
(Modal recommended in the design doc; Replicate or Beam are alternatives) so
the *Start* button actually starts training.

Read `openspec/changes/wire-dashboard-to-hosted-training/` first:
- `proposal.md` — why and what
- `design.md` — provider comparison, edge-function shapes, HMAC callback
  contract, dataset access options, security boundary, risk register
- `tasks.md` — 22 unchecked items across 7 sections
- `specs/hosted-training-trigger/spec.md` — capability requirements
- `specs/model-registry-web-dashboard/spec.md` — modified scenarios

The first task is `2.1 Add migration adding provider_job_id text to public.runs`.
The biggest block is task 4 (the Python worker package).

### 2. Fix `R2_ACCOUNT_ID`

The currently-set Supabase secret `R2_ACCOUNT_ID` value is a Cloudflare API
token (`cfat_…`), not a 32-hex Cloudflare account id. The R2 SDK calls inside
Edge Functions therefore fail at runtime with
`R2 env not configured`. Affected:

- `upload-artifact` (signed PUT URL for tflite/mlmodel)
- `upload-dataset` (signed PUT URL for dataset YAMLs — what the dashboard's
  Upload .yaml button calls)
- `storage-usage POST /delete` (R2 object deletion)

Reads (`storage-usage GET`) work because they only touch Supabase, not R2.

To fix:
1. Find the account id in the Cloudflare dashboard (R2 sidebar, top-right
   "Account ID" — 32 hex chars).
2. `supabase secrets set R2_ACCOUNT_ID=<32-hex>`.
3. Verify by clicking *Upload .yaml* in the dashboard with a small test YAML.

### 3. Rotate the R2 token *(carry-over from earlier hand-off)*

During earlier backend work, live R2 credentials briefly sat in a gitignored
`.env.local` inside a deleted worktree. They were not committed but should be
rotated in Cloudflare anyway before any production use. Rotate, then update
`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` Supabase secrets.

### 4. Wire dataset image data, not just the YAML

Today the *Upload .yaml* button stores only the YOLO config YAML on R2. The
actual training images still have to be on whatever machine runs the trainer
(your laptop, the Colab VM after the clone). To make a stranger-with-just-the-
URL workflow feasible:

1. Extend `upload-dataset` (or add `upload-dataset-images`) to accept a zip
   and store at `datasets/{slug}/{stamp}/images.zip`.
2. Add a *Upload images (.zip)* button in the dashboard next to the YAML one.
3. Update the Colab notebook's *Pull dataset* cell to fetch the zip via
   presigned GET, unzip into the path the YAML references.

This is the natural follow-up to section 1 — once a worker is invoked
server-side, both YAML and images need to be reachable from the worker.

### 5. Make the Colab notebook actually train

`notebooks/train_run.ipynb` is a working scaffold but the *Pull dataset* cell
contains a `TODO: fetch from R2 and place at the path YOLO expects` for the
case when `config.dataset` is an R2 key. Today it works only when the dataset
reference is a path that already exists in the cloned repo (e.g.
`configs/dataset.banana-v2.yaml`). Closing this TODO together with item 4
turns *Open in Colab* into a fully self-contained training launch.

### 6. Archive completed OpenSpec changes

Run `openspec archive` for each of:

- `add-model-registry-backend`
- `add-python-registry-sdk`
- `add-model-registry-web-dashboard`
- `connect-dashboard-to-live-registry`

`openspec archive` is interactive — run it locally and confirm each.

### 7. Polish backlog (lower priority)

- Drag-reorder of classes (today: edit order = re-upload YAML).
- Upload progress indicator for big files (current upload has no progress).
- Pagination on Recent runs (currently slices to 6).
- Mobile sub-nav reflow at very narrow widths is functional but cramped.
- Dataset YAML preview cell — show parsed `train`/`val`/`test` paths after
  upload to give an extra sanity check.

---

## Validation

From repo root, before any push:

```bash
python3 -m unittest discover -s tests
openspec validate --all --strict
```

From `apps/web`:

```bash
npm run build
```

Browser smoke test (deployed):

1. Open https://phongsakorn-ipassion.github.io/advance-seeds-field-inspector-ml/
2. Click *Sign in as Admin* → land on Overview.
3. Train → form tab → adjust epochs → click *Start Colab MCP training* →
   Live tracking tab now shows a `1` badge and the new run.
4. Click the run → detail slides in below.
5. *Open in Colab* opens the notebook with `?run_id=<id>` in the URL.

Local credentials live in `/Users/ppungpong/.env.advance-seeds`. Source it
before running `supabase` or `gh` commands that need them.

---

## Operational notes

- The Supabase project is **shared with `advance-seeds-field-inspector-demo`**.
  Migrations were applied via raw `psql` to avoid disrupting the demo's
  migration history. Future migrations should use the same path. See
  `connect-dashboard-to-live-registry/design.md` for the rationale.
- All write privileges (`INSERT/UPDATE/DELETE`) on the registry tables are
  granted to `authenticated`; row-level access is gated by the `is_admin()`
  RLS function which reads `app_metadata.role` from the JWT. Don't revoke
  the verbs without also rewriting the RLS gate.
- Service-role key is **only** in: Supabase Functions runtime, the local
  `.env.advance-seeds`, and whoever pastes it into a Colab notebook.
  It is **never** in the browser bundle. Do not change this.
- The Pages workflow uses GitHub repo variables (not secrets) for
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` because the anon key is
  intentionally public — RLS is the security boundary.

---

## Do not do

- Do not move the service-role key to `VITE_*` variables. RLS is the boundary;
  putting service-role in the browser would bypass it.
- Do not revoke `INSERT/UPDATE/DELETE` on the registry tables again — see
  migration `…008` for the reason.
- Do not remove the `supabase_realtime` publication entries. The dashboard
  silently breaks without them and the failure mode is hard to spot.
- Do not bypass `is_admin()` checks in the Edge Functions. The `roleFromJwt`
  helper in `_shared/cors.ts` is shared across functions; keep using it.
- Do not run `openspec archive` non-interactively or in CI. It expects
  human confirmation per change.
- Do not commit the contents of `/Users/ppungpong/.env.advance-seeds`.
