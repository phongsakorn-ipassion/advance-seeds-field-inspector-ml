## Why

The dashboard under `apps/web` already implements the full operator workflow
(login, overview, train, model detail, deploy/undeploy, storage cleanup), but
every screen reads and writes local React state. The registry backend
(`supabase/`) and Python SDK already accept real runs, metrics, versions, and
channel updates, so the dashboard now needs to switch from sample state to
Supabase as its source of truth without losing the demo workflow.

## What Changes

- Add a Supabase-backed data adapter inside `apps/web/src/registry/` so the UI
  can read live `model_lines`, `runs`, `run_metrics`, `versions`, `channels`,
  and `channel_history` rows.
- Replace the demo email/password gate with Supabase Auth and gate write
  controls on `app_metadata.role = "admin"`.
- Subscribe to Realtime updates for `runs` and `run_metrics` so live training
  progress reflects actual SDK writes.
- Wire deploy/undeploy buttons to update `channels` rows (RLS already audits
  the change into `channel_history`).
- Add an admin-only Edge Function that reports R2 storage usage and deletes
  inactive artifacts; the dashboard never touches R2 credentials directly.
- Keep the existing local-state demo store available behind a feature flag so
  the dashboard remains demonstrable without a Supabase project.
- Add a GitHub Pages deploy workflow for `apps/web/dist`.

## Capabilities

### Modified Capabilities

- `model-registry-web-dashboard`: gains live registry data, real auth, Realtime
  metric tracking, channel writes, and admin-only storage cleanup; deploys to
  GitHub Pages from CI.

### New Capabilities

- None (extends an existing capability).

## Impact

- Adds Supabase JS client dependency to `apps/web`.
- Adds a new Edge Function `storage-usage` under `supabase/functions/`.
- Adds `apps/web/.env.example` declaring the Vite Supabase variables.
- Adds a GitHub Actions workflow that publishes the built dashboard.

## Non-goals

- No service-role secrets in the browser bundle.
- No direct Cloudflare R2 access from the browser.
- No customer/tenant portal.
- No replacement of the Python SDK as the source for run lifecycle writes.
- No removal of the demo store; live mode is opt-in via env vars.
