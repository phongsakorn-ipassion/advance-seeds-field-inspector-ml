---
project: ml-repo
type: reference
status: active
tags: [sdk, registry, python, http]
created: 2026-06-22
updated: 2026-06-22
sources: [src/advance_seeds_ml/registry/client.py, src/advance_seeds_ml/registry/__init__.py]
canonical: false
---

# Python registry SDK

> [!abstract] TL;DR
> A thin HTTP client (`RegistryClient`) over Supabase REST + Edge Functions, used by the
> training scripts and the worker to manage runs, metrics, artifacts, and versions.

## Surface (`src/advance_seeds_ml/registry/client.py`)
- `RegistryConfig.from_env()` — reads `MODEL_REGISTRY_URL`|`SUPABASE_URL` +
  `MODEL_REGISTRY_SERVICE_ROLE_KEY`|`SUPABASE_SERVICE_ROLE_KEY`.
- `create_run(...)` → POST `/rest/v1/runs`; `log_metrics(run_id, [...])` →
  POST `/rest/v1/run_metrics`; `finalize_run(run_id, status)` → PATCH.
- `upload_artifact(path, kind, run_id, semver)` → POST `/functions/v1/upload-artifact`
  for a presigned URL, PUT the bytes, return `UploadedArtifact(r2_key, size_bytes,
  content_hash="sha256:…")` (zips a directory artifact first).
- `create_version(...)` → POST `/rest/v1/versions`.
- `delete_dataset_bundle(r2_key)` → POST `/functions/v1/delete-dataset`.
- Pluggable `transport` (defaults urllib) for testing.

## Invariants
- Auth headers auto-injected: `Authorization: Bearer <key>` + `apikey: <key>`.
- semver is not validated by the SDK — callers choose the format (`train_for_run.py`
  uses `1.0.0-{run_id[:8]}`, the worker `0.1.{run_id[:8]}`).
- `tflite_r2_key`/`mlmodel_r2_key` may be None (failed export); the SDK passes metadata
  through without schema validation (backend is authoritative).

## Gotchas / footguns
> [!warning] No retries — a transient registry outage fails training immediately.
> `_first_row` raises if a query returns no rows.

> [!warning] urllib transport reads the full response into memory; no pagination, no
> version-query API (read versions via Supabase REST directly if needed).

## Related
- [[edge-functions]] · [[model-registry-db]] · [[training-driver]] · [[training-worker]]
