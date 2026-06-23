---
project: ml-repo
type: reference
status: active
tags: [registry, supabase, postgres, rls, r2, storage]
created: 2026-06-22
updated: 2026-06-22
sources: [supabase/migrations/, infra/r2-cors.json, supabase/functions/_shared/r2.ts]
canonical: true
---

# Model registry — DB + storage (canonical)

> [!abstract] TL;DR
> Supabase Postgres (model_lines → runs → versions → channels/deployments) + Cloudflare
> R2 for artifact blobs. A trigger auto-computes [[compat-signature]]; Realtime streams
> live updates to the [[web-dashboard]].

## Schema (tables)
- `model_lines` (slug unique; seeds `seeds-poc`) — `20260502000001_model_lines.sql`
- `runs` (status ∈ running/succeeded/failed/cancelled; `config_yaml` jsonb holds hyper,
  classes, dataset, exportOptions, logs; `provider_job_id`) — `20260502000002_*`
- `run_metrics` (run_id, step, epoch, name, value; indexed `(run_id,name,step)`) — same file
- `versions` (semver unique per line; `metadata` jsonb; `tflite_r2_key`/`mlmodel_r2_key`/
  `pytorch_r2_key`; `compat_signature` via trigger) — `20260502000003_versions.sql`
- `channels` (staging/production; legacy `current_version_id`) — `20260502000004_*`
- `channel_history` (audit trail; trigger on channel update) — same file
- `channel_deployments` (the **current** way to track deployed versions; ≤1
  `is_default` active per (line,channel)) — `20260503000002_*`

## R2 storage
- Bucket `advance-seeds-models`; helper `supabase/functions/_shared/r2.ts`
  (`presignGet` 3600s, `presignPut` 900s, `deleteObject`).
- Key patterns: artifacts `runs/{run_id}/{semver}.{tflite|pt|mlpackage.zip}`;
  datasets `datasets/{line}/{ISO-timestamp}/{file}`.
- CORS `infra/r2-cors.json` — hardcoded origins (localhost dev + the GitHub Pages URL);
  must be re-applied when origins change.

## Invariants
- **RLS:** public read on metadata tables, authenticated read on runs/metrics, admin-only
  writes via `is_admin()` (JWT `app_metadata.role == admin`); service_role bypasses RLS.
  `20260502000008` re-grants writes to `authenticated` so RLS denials raise instead of
  silently affecting 0 rows.
- Realtime publication + `REPLICA IDENTITY FULL` on runs/metrics/channels/versions/
  deployments so the dashboard sees DELETEs.
- `tflite_r2_key` is **nullable** since `20260521000002` (Android-disabled runs ship
  iOS/PyTorch only). The export-options "min one platform" constraint was dropped
  (`20260521000003`).

## Gotchas / footguns
> [!warning] These migrations describe **repo** state. The cloud project can lag — the
> nullable `tflite_r2_key` migration was not pushed to cloud, so a CoreML-only run 400'd.
> Apply with `supabase db push`. Tracked in [[drift-register]] (D-CLOUD-MIGRATION-DRIFT).

> [!warning] `channels.current_version_id` (legacy) and `channel_deployments` (current)
> are **two ways** to track the deployed version. Read from `channel_deployments`; if
> they diverge, mobile can get a stale version. Tracked in [[drift-register]] (D-CHANNEL-DUAL).

> [!warning] No transaction spans the R2 upload + the `versions` insert — a failed
> upload can leave an orphaned version row with a missing key.

> [!warning] Storage quota (`STORAGE_QUOTA_BYTES`, default 512MB) is **advisory** —
> `storage-usage` reports it but `upload-artifact` does not enforce it.

## Related
- [[compat-signature]] (canonical) · [[edge-functions]] · [[web-dashboard]]
- [[model-export-contract]] · [[drift-register]]
