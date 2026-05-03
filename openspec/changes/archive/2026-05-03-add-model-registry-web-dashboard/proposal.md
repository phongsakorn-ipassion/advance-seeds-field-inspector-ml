## Why

The registry backend and Python SDK can now accept model runs, metrics, and
versions, but operators still need a browser surface to inspect runs and manage
which version is staged or production. A GitHub Pages dashboard provides the
operator journey without adding a custom server.

## What Changes

- Add a Vite + React + TypeScript dashboard under `apps/web/`.
- Show a model-registry operator overview: runs, model versions, channel state,
  and promotion/rollback affordances.
- Keep the first slice static/sample-data based while preserving the component
  boundaries needed for Supabase integration.
- Document the web app environment and deployment path.

## Capabilities

### New Capabilities

- `model-registry-web-dashboard`: Browser dashboard for registry operators to
  inspect runs, compare versions, and manage staging/production channels.

### Modified Capabilities

- None.

## Impact

- New frontend app under `apps/web/`.
- New npm lockfile scoped to the web app.
- Future GitHub Pages deployment can build `apps/web/dist`.

## Non-goals

- No mobile OTA client.
- No training orchestration button.
- No customer/tenant portal.
- No direct Cloudflare R2 credentials in browser code.
