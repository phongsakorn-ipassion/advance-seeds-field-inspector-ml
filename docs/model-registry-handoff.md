# Model Registry — Hand-off Document

**Date:** 2026-05-02  
**Branch:** `main` (merged from `feature/model-registry-backend`)  
**Owner:** phongsakorn.p@ipassion.co.th

---

## What Was Built

**Plan 1 — Backend Foundation** is complete and merged to `main`.

This covers the Supabase + Cloudflare R2 backend that all other plans depend on: database schema, row-level security, two Edge Functions (OTA resolution and artifact upload), a shared TypeScript utility layer, CI, and local dev docs.

Nothing from the web dashboard, Python SDK, or mobile client has been built yet.

---

## Repository Layout (new files)

```
supabase/
  migrations/
    20260502000001_model_lines.sql      model_lines table + seeds-poc seed row
    20260502000002_runs_and_metrics.sql runs + run_metrics tables
    20260502000003_versions.sql         versions table + compute_compat_signature()
    20260502000004_channels.sql         channels + channel_history + audit trigger
    20260502000005_rls.sql              RLS policies + is_admin() + REVOKE grants
    20260502000006_seed.sql             placeholder (intentionally empty)
    20260502000007_fix_compat_trigger.sql always recomputes compat_signature on UPDATE
  fixtures/
    seed_run_v1.sql                     deterministic test fixture (run + version 1.0.0)
  functions/
    _shared/
      compat.ts                         computeCompatSignature() — mirrors Postgres logic
      compat.test.ts                    parity test with reference hash
      r2.ts                             presignGet() / presignPut() via AWS SDK
      cors.ts                           CORS headers helper
      supabase.ts                       typed Supabase client
    resolve-channel/
      index.ts                          GET /functions/v1/resolve-channel (mobile OTA)
      index.test.ts
    upload-artifact/
      index.ts                          POST /functions/v1/upload-artifact (training SDK)
      index.test.ts
  tests/sql/
    schema.test.sql                     pgTAP: tables, index, audit trigger
    compat_signature.test.sql           pgTAP: trigger sets signature, matches helper
    rls.test.sql                        pgTAP: anon/authenticated access rules
  .env.example                          template for local secrets
  config.toml                           Supabase project config
.github/workflows/backend.yml           CI: migrations + SQL tests + Edge Function tests
docs/backend-setup.md                   operator guide for local dev and cloud deploy
openspec/changes/add-model-registry-backend/
  specs/model-registry/spec.md          capability spec (channels, versions, OTA, RLS)
docs/superpowers/specs/
  2026-05-02-model-registry-web-app-design.md  full design document
docs/superpowers/plans/
  2026-05-02-backend-foundation.md      Plan 1 implementation plan (all tasks ✅)
```

---

## Key Technical Decisions

### Auth model (two tiers)

| Caller | Key type | Postgres role | Write access |
|---|---|---|---|
| Training script / CI | `service_role` key | `service_role` (bypasses RLS) | Yes |
| Dashboard (human) | GitHub OAuth → Supabase Auth JWT with `app_metadata.role = "admin"` | `authenticated` | Yes (admin only) |
| Mobile app | none (anon) | `anon` | No |

The `is_admin()` helper in [supabase/migrations/20260502000005_rls.sql](supabase/migrations/20260502000005_rls.sql) reads `app_metadata.role`, **not** the top-level JWT `role` claim. The top-level claim is the Supabase role string (`anon`/`authenticated`/`service_role`).

### OTA compatibility signature

```
compat_signature = sha256(canonical_json({
  class_names: [...],   // ordered list
  input_size: 640,
  output_kind: "end2end_nms_free",
  task: "segment"
}))
```

Computed by a Postgres trigger on every `INSERT`/`UPDATE` of `versions`. The TypeScript implementation in [supabase/functions/_shared/compat.ts](supabase/functions/_shared/compat.ts) must produce the identical hash — the parity test in `compat.test.ts` enforces this with a reference vector.

**Critical serialisation detail:** Postgres `to_jsonb(array)::text` renders arrays as `["a", "b"]` (space after comma). The TypeScript code uses `join(", ")` to match. If you ever rewrite the JS side, verify the reference hash `0256a1435c9aa3f4761eb9028999e8eb0af61726ac0d087b3610b8ea5f1a28d1` still passes.

### R2 key validation

`upload-artifact` validates both `run_id` and `semver` against `/^[A-Za-z0-9._-]+$/` before constructing the R2 key, preventing path injection. See [supabase/functions/upload-artifact/index.ts](supabase/functions/upload-artifact/index.ts).

### RLS hard-deny pattern

`supabase/migrations/20260502000005_rls.sql` uses explicit `REVOKE INSERT, UPDATE, DELETE, TRUNCATE FROM anon, authenticated` before defining policies. This means an RLS miss raises `insufficient_privilege` instead of silently returning `0 rows affected`, which makes integration tests reliable.

---

## Running Locally

```bash
# Prerequisites: Supabase CLI, Docker Desktop

cp supabase/.env.example supabase/.env.local
# Fill in: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET

supabase start
supabase db reset           # apply all migrations
supabase test db            # 11 SQL tests — should all pass

# Edge Function tests (requires live R2 credentials in .env.local)
source supabase/.env.local
supabase functions serve --env-file supabase/.env.local &
deno test supabase/functions --allow-net --allow-env
```

Full operator guide: [docs/backend-setup.md](docs/backend-setup.md)

---

## Outstanding Items

### Must do before any plan continues

- **Rotate R2 credentials.** The live R2 access key that was used during development was written to `.worktrees/model-registry-backend/supabase/.env.local` (the worktree is now deleted, but the key was seen). Go to the Cloudflare dashboard and rotate it. The new key goes in `supabase/.env.local` (gitignored) and as a GitHub Actions secret.

### Pending before `openspec archive`

The OpenSpec change `add-model-registry-backend` has all tasks marked complete but has not been moved to `openspec/changes/archive/`. The `openspec archive` command is interactive; run it manually when ready.

---

## What Comes Next (Plans 2–4)

These are independent plans that depend on Plan 1's backend being live. They can be executed in any order, though Plan 2 (Python SDK) is the most immediately useful for daily training runs.

### Plan 2 — Python Registry SDK

**Location:** `src/advance_seeds_ml/registry/`  
**What it does:** Wraps the Supabase API and Edge Functions so that `train_yolo26n_seg.py` can call `Registry.start_run()`, `Registry.log_metrics()`, `Registry.upload_artifact()`, and `Registry.create_version()` without knowing about HTTP or R2.  
**Depends on:** `upload-artifact` Edge Function, `runs` + `run_metrics` tables.

### Plan 3 — Web Dashboard

**Location:** `apps/web/`  
**Stack:** Vite + React + TypeScript + TanStack Query + TanStack Router + Zustand + shadcn/ui + Recharts  
**Hosting:** GitHub Pages (static SPA)  
**What it does:** Live training run metrics, version comparison, channel promotion / rollback.  
**Depends on:** All backend tables and Edge Functions.

### Plan 4 — Mobile OTA Client

**Location:** `advance-seeds-field-inspector-demo` repo  
**What it does:** On app launch, calls `resolve-channel`, downloads the model if the compat_signature matches and the version changed, atomically swaps the cached model, verifies `content_hash`.  
**Depends on:** `resolve-channel` Edge Function.

---

## Reference Links

| Document | Path |
|---|---|
| Full design spec | [docs/superpowers/specs/2026-05-02-model-registry-web-app-design.md](docs/superpowers/specs/2026-05-02-model-registry-web-app-design.md) |
| Plan 1 implementation plan | [docs/superpowers/plans/2026-05-02-backend-foundation.md](docs/superpowers/plans/2026-05-02-backend-foundation.md) |
| OpenSpec capability spec | [openspec/changes/add-model-registry-backend/specs/model-registry/spec.md](openspec/changes/add-model-registry-backend/specs/model-registry/spec.md) |
| Backend setup guide | [docs/backend-setup.md](docs/backend-setup.md) |
