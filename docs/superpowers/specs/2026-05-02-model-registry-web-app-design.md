# Model Registry Web App — Design

**Date:** 2026-05-02
**Status:** Draft, pending implementation plan
**Owner:** phongsakorn.p@ipassion.co.th

## 1. Goal

Build an internal MLOps-lite web app that owns the lifecycle of trained YOLO26n-seg
models for the Advance Seeds Field Inspector. The app replaces today's
"copy artifacts straight into the mobile repo" flow with a versioned registry
that the inspector mobile app fetches from over the air (OTA).

The operator (initially a single ML engineer, later a small team) uses a
dashboard to:

1. Observe training runs with live metrics streamed from the training script.
2. Compare model versions on metrics, classes, and exported artifacts.
3. Promote a version to a `staging` or `production` channel with one click.
4. Roll back by re-pointing a channel to a previous version.

The mobile inspector app calls a single OTA endpoint on launch, downloads a
newer model when the channel pointer changed and the new version is
OTA-compatible, and otherwise continues using its bundled model until a store
release ships a structurally new version.

### Non-Goals (PoC)

- Training orchestration (no "Start training" button — training stays where it is).
- Customer or tenant separation; the registry is internal-only.
- A/B traffic splitting or per-device targeting.
- Billing, analytics dashboards, or end-customer portals.

## 2. Stack

| Layer | Choice |
| --- | --- |
| Hosting (UI) | GitHub Pages |
| Frontend | Vite + React + TypeScript |
| Routing | TanStack Router |
| Server state | TanStack Query + Supabase JS SDK |
| Client/UI state | Zustand (UI-only state — never server data) |
| UI primitives | shadcn/ui + Tailwind CSS |
| Charts | Recharts |
| Backend platform | Supabase (Postgres, Auth, Realtime, Edge Functions) |
| Auth | Supabase Auth with GitHub OAuth |
| Artifact storage | Cloudflare R2 (private bucket, signed URLs) |
| Mobile-facing API | Supabase Edge Function `resolve-channel` |
| Training-side SDK | Python module in this repo (`src/advance_seeds_ml/registry/`) |
| CI / deploy | GitHub Actions (build + deploy Pages on push to `main`) |

### Repo Layout

Monorepo, in this repository. The web app and the Python SDK live alongside
the existing training and export code.

```
apps/
  web/                            Vite + React dashboard (deploys to Pages)
    src/
      features/
        runs/                     Run list, detail, live metrics
        versions/                 Version list, compare, artifact download
        channels/                 Channel state, promote/rollback dialog
      lib/supabase.ts             Single Supabase client + typed helpers
      store/ui.ts                 Zustand UI-only store
      routes/                     TanStack Router routes
    public/
    index.html
supabase/
  migrations/                     SQL schema, RLS policies
  functions/
    resolve-channel/              Mobile OTA resolution + R2 signed URL
    upload-artifact/              Signed PUT URL for training-side uploads
src/advance_seeds_ml/
  registry/                       NEW — Python SDK (start_run, log_metrics, ...)
scripts/
  train_yolo26n_seg.py            MODIFIED — calls Registry SDK
```

## 3. Components & Boundaries

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `apps/web/` | Pure static SPA. Reads/writes Supabase via JS SDK; never holds R2 keys. | Supabase JS SDK |
| `apps/web/.../features/runs/` | Run list, run detail page, live metric subscription. | TanStack Query, Supabase Realtime |
| `apps/web/.../features/versions/` | Version list, compare view, artifact download trigger. | TanStack Query |
| `apps/web/.../features/channels/` | Channel state UI, promote and rollback dialogs, history view. | TanStack Query |
| `apps/web/.../lib/supabase.ts` | One Supabase client; thin typed wrappers around tables and RPCs. | `@supabase/supabase-js` |
| `apps/web/.../store/ui.ts` | Zustand store for UI-only state: selected run id, list filters, modal open flags. | nothing |
| `supabase/migrations/` | SQL schema, indexes, RLS policies. | — |
| `supabase/functions/resolve-channel/` | Mobile OTA endpoint. Looks up channel + version, mints short-lived R2 signed URL. | R2 S3 SDK, Supabase service role |
| `supabase/functions/upload-artifact/` | Issues signed PUT URL for training-side uploads. Authenticated as admin. | R2 S3 SDK, Supabase service role |
| `src/advance_seeds_ml/registry/` (new) | Python SDK: `start_run`, `log_metrics`, `upload_artifact`, `create_version`, `finalize_run`. | `requests`, `supabase-py` |
| `scripts/train_yolo26n_seg.py` (modified) | Calls Registry SDK at run start, every epoch end, on finish. | `registry/` |

### Boundary Rules

- The web app **never** talks to R2 directly. Every download or upload goes
  through an Edge Function, so the R2 keys live only in Supabase secrets.
- Training scripts also go through Edge Functions for the same reason; the
  Python SDK only sees Supabase URLs and pre-signed R2 URLs.
- Zustand holds **UI-only** state. Anything fetched from Supabase lives in
  TanStack Query. Mixing the two is a known source of stale-data bugs.

## 4. Data Model

```sql
-- Single PoC line for now; future-proof for multiple lines.
model_lines (
  id          uuid pk,
  slug        text unique,           -- e.g. 'seeds-poc'
  display_name text,
  created_at  timestamptz
)

-- One execution of train_yolo26n_seg.py.
runs (
  id          uuid pk,
  model_line_id uuid fk,
  status      text check in ('running','succeeded','failed','cancelled'),
  config_yaml jsonb,                 -- full hyperparameter file
  started_at  timestamptz,
  finished_at timestamptz,
  git_sha     text,
  host        text,                  -- machine label (laptop, banana-gpu, ...)
  hardware    jsonb,                 -- {device, vram_gb, ...}
  created_by  uuid                   -- supabase user id
)

-- Time-series metrics streamed during training.
run_metrics (
  run_id      uuid fk,
  step        int,
  epoch       int,
  name        text,                  -- 'box_loss', 'seg_loss', 'mAP50', ...
  value       double precision,
  recorded_at timestamptz
)
INDEX (run_id, name, step)

-- A specific exported, registered model version (the artifact set).
versions (
  id          uuid pk,
  run_id      uuid fk null,          -- null = manually registered (no run)
  model_line_id uuid fk,
  semver      text,                  -- '1.4.0'
  compat_signature text,             -- sha256(classes||input_size||output_kind||task)
  metadata    jsonb,                 -- the full model-metadata.json contents
  tflite_r2_key text,
  mlmodel_r2_key text null,
  size_bytes  bigint,
  content_hash text,                 -- sha256 of the tflite bytes
  created_at  timestamptz,
  created_by  uuid
)

-- One row per (model_line, channel_name); promoting = updating current_version_id.
channels (
  id          uuid pk,
  model_line_id uuid fk,
  name        text check in ('staging','production'),
  current_version_id uuid fk null,
  updated_at  timestamptz,
  updated_by  uuid,
  unique (model_line_id, name)
)

-- Audit log of every promotion or rollback.
channel_history (
  id          uuid pk,
  channel_id  uuid fk,
  from_version_id uuid null,
  to_version_id   uuid null,
  reason      text,
  changed_at  timestamptz,
  changed_by  uuid
)
```

### Row-Level Security (in plain English)

- `SELECT` on `versions`, `channels`, `model_lines`, `channel_history` —
  anonymous allowed (mobile app + public dashboard reads).
- `SELECT` on `runs`, `run_metrics` — authenticated users only.
- All `INSERT/UPDATE/DELETE` — only role `admin` (Supabase JWT custom claim
  `role = 'admin'`).
- The training-side Python SDK authenticates with a non-interactive service
  role key stored in `.env` locally and as a GitHub Actions secret in CI.

## 5. Key Flows

### Flow A — Live Run Reporting

1. `train_yolo26n_seg.py` calls `Registry.start_run(config)` which inserts a
   row in `runs` and returns a `run_id`.
2. At each epoch end, the script calls
   `Registry.log_metrics(run_id, {epoch, box_loss, seg_loss, mAP50, mAP50_95, ...})`
   which bulk-inserts rows into `run_metrics`.
3. The web dashboard subscribes to `run_metrics` filtered by `run_id` via
   Supabase Realtime; charts update without polling.
4. On finish (success or failure), the script calls
   `Registry.finalize_run(run_id, status)` which sets `status` and
   `finished_at`.

### Flow B — Register A New Version

1. After Ultralytics export, the script (or a manual CLI) calls
   `Registry.upload_artifact(run_id, kind="tflite", path=...)`.
2. The Python SDK requests a signed PUT URL from the `upload-artifact` Edge
   Function, then PUTs the file directly to R2.
3. The script calls `Registry.create_version(run_id, metadata, r2_keys, semver)`.
   The server computes `compat_signature` from `metadata.class_names`,
   `metadata.input_size`, `metadata.output_kind`, and `metadata.task`, then
   inserts a row in `versions`.

### Flow C — Promote A Version

1. Operator clicks "Promote v1.4.0 → production" in the dashboard.
2. Frontend updates `channels.production.current_version_id` and inserts a
   row in `channel_history`. RLS rejects the call if the user is not `admin`.
3. The next mobile poll observes the new version.

### Flow D — Mobile OTA Resolution (the published API)

```
GET /functions/v1/resolve-channel
  ?channel=production
  &model_line=seeds-poc
  &current_compat=<sig>
  &current_version=<id>
```

1. Edge Function reads `channels` filtered by `model_line` and `name`,
   joins to the current `versions` row.
2. If `current_compat` matches `versions.compat_signature` and
   `current_version` differs from `current_version_id`, the function returns:
   ```json
   {
     "action": "update",
     "version_id": "...",
     "semver": "1.4.0",
     "model_url": "<R2 signed URL valid 1h>",
     "metadata": { ... },
     "content_hash": "sha256:..."
   }
   ```
3. If `current_compat` does not match `compat_signature`, the function
   returns:
   ```json
   {
     "action": "rebuild_required",
     "reason": "compat_signature_changed",
     "expected_compat": "...",
     "current_compat": "..."
   }
   ```
4. If `current_version` already matches, the function returns
   `{"action": "noop"}`.
5. The mobile app downloads the artifact, verifies `content_hash`, and
   atomically swaps the cached model file. On any failure it keeps the
   currently-cached model.

## 6. OTA Compatibility Rule

A version is OTA-compatible with a running mobile app if and only if their
`compat_signature` values match exactly, where:

```
compat_signature = sha256(
    canonical_json({
        "class_names": metadata.class_names,        -- ordered list
        "input_size": metadata.input_size,          -- int
        "output_kind": metadata.output_kind,        -- e.g. 'end2end_nms_free'
        "task":        metadata.task                -- e.g. 'segment'
    })
)
```

Canonicalization rules: UTF-8, no whitespace, sorted object keys at every
level, arrays preserved in source order. Both the registry server and the
mobile app compute the signature with the identical algorithm; a contract
test enforces parity (see §7).

If the signature changes (e.g. a new class is added, input size moves from
640 to 768), the version is marked `requires_app_update: true` and the
mobile app refuses the OTA, falling back to the bundled model until a store
release ships.

## 7. Testing & Validation

- **Python SDK** — unit tests for request shaping; integration test against
  a local Supabase started by the Supabase CLI, covering the full sequence:
  `start_run` → `log_metrics` → `upload_artifact` → `create_version` →
  `promote` → `resolve-channel`.
- **Edge Functions** — Deno tests plus integration tests with seeded fixture
  data. The OTA compat-signature mismatch branch must be tested explicitly.
- **Frontend** — Vitest for hooks and the Zustand store. One Playwright
  smoke test that signs in, lists runs, promotes a version, and confirms
  the channel updated.
- **Contract test** — given a `model-metadata.json` produced by
  `scripts/write_model_metadata.py`, assert that the registry's
  `compat_signature` algorithm produces the same value the mobile app will
  compute. This is the seam most likely to silently drift.
- **OpenSpec** — this capability is governed by a new spec, `model-registry`,
  with one `## Requirement:` block per section in this design (channels,
  versions, runs, OTA resolution, compat signature, RLS).

## 8. Tradeoffs & Known Limits

- **Public-readable mobile API:** anyone with a model line slug can read
  `production` channel state. Acceptable for the PoC; signed model URLs
  expire in 1h, so artifact access is not perpetually public.
- **Supabase free tier is tight on storage** (1GB). Artifacts live in R2,
  but Postgres still grows with `run_metrics`. Plan to prune old metric
  rows once Postgres approaches the limit.
- **R2 free tier** covers 10GB storage and 1M Class A operations per month —
  ample for PoC scale. Egress is free.
- **No live training metrics during host-down events:** if the training
  host loses network mid-run, metrics resume on reconnect but the run row
  may stay in `running` until a heartbeat watchdog times it out. Watchdog
  is intentionally out of scope for v1.
- **No `dev` channel:** v1 ships only `staging` and `production`. Mobile
  builds can pin a specific `version_id` for ad-hoc testing.
