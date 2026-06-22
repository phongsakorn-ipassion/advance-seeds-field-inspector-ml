---
project: ml-repo
type: reference
status: active
tags: [registry, edge-functions, deno, supabase, r2]
created: 2026-06-22
updated: 2026-06-22
sources: [supabase/functions/]
canonical: true
---

# Supabase Edge Functions (canonical)

> [!abstract] TL;DR
> The Deno HTTP layer bridging Postgres + R2. Handles training dispatch, the training
> callback, presigned artifact/dataset URLs, and the app-facing channel resolution.

## The functions
| Function | Role | Auth |
| --- | --- | --- |
| `start-training` | insert a `runs` row, dispatch to the training provider, store `provider_job_id` | admin |
| `training-callback` | HMAC-verified webhook: apply metric/log/succeeded/failed; on success create the `versions` row | HMAC (`x-training-signature`) |
| `upload-artifact` / `download-artifact` | presigned PUT/GET for `runs/{id}/{semver}.{ext}` | admin / service_role |
| `upload-dataset` / `download-dataset` / `delete-dataset` | presigned PUT/GET / delete for `datasets/...` | admin |
| `list-deployed-models` | list active `channel_deployments` for (line,channel,platform) + signed URLs | public |
| `resolve-channel` | mobile update check via [[compat-signature]] → `update`/`rebuild_required`/`noop`/`artifact_missing` | public |
| `storage-usage` | GET usage vs quota; POST delete/archive versions | admin |

## Shared helpers (`_shared/`)
- `supabase.ts` (service client), `r2.ts` (presigning), `cors.ts`, `compat.ts`
  ([[compat-signature]] JS side), `model-metadata.ts` (`artifactDetailForPlatform`),
  `exportOptions.ts` (validate ios/android quantize + NMS: maxDet 1–300, iou/conf 0–1).

## Invariants
- `training-callback` verifies HMAC-SHA256 over the raw body with `TRAINING_CALLBACK_SECRET`.
- Default export options when absent: `{ ios:{quantize:true}, android:{quantize:true} }`.
- Presigned upload/download URLs ~15min; model-download URLs (list/resolve) ~1h.
- Env: `SUPABASE_*`, `R2_*`, `TRAINING_PROVIDER_BASE_URL/_API_KEY`, `TRAINING_CALLBACK_SECRET`,
  `STORAGE_QUOTA_BYTES`. Cloud secrets via `supabase secrets set` (not `.env`).

## Gotchas / footguns
> [!warning] `start-training` catches provider errors and marks the run failed but does
> **not retry**; a down provider can leave a run stuck `running` until it's flagged stalled.

> [!warning] `training-callback` metric-name aliasing maps variants (`box.map50`,
> `metrics/map50(b)`) to canonical keys; if the trainer's stdout format changes, metrics
> silently vanish from the dashboard.

> [!warning] Some example/test metadata uses `output_kind: segmentation-mask` /
> `task: segmentation` — **outside** the contract vocab. See [[drift-register]] (D1) and
> the in-flight `align-registry-metadata-strings` OpenSpec change.

## Related
- [[model-registry-db]] · [[compat-signature]] (canonical) · [[web-dashboard]]
- [[training-driver]] · [[python-registry-sdk]] · [[drift-register]]
