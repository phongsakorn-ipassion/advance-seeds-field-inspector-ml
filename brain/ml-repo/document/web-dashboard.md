---
project: ml-repo
type: reference
status: active
tags: [web, react, vite, dashboard]
created: 2026-06-22
updated: 2026-06-22
sources: [apps/web/src/App.tsx, apps/web/src/registry/]
canonical: false
---

# Registry web dashboard (React/Vite)

> [!abstract] TL;DR
> The React 19 + Vite admin UI: browse runs/versions/channels, launch training,
> deploy/archive versions, monitor storage. Backed by a Supabase store with Realtime;
> falls back to an in-memory demo store when env vars are missing.

## Structure
- `src/App.tsx` — the whole UI (Overview / Train / Models / Storage), auth, notifications.
- `src/registry/` — the store layer:
  - `api.ts` — the `RegistryStore` interface (the contract App.tsx codes against)
  - `supabaseStore.ts` — real impl: queries, DB-row→domain mapping, Realtime, admin writes
  - `demoStore.ts` — in-memory fallback (`index.ts` picks based on `VITE_SUPABASE_*`)
  - `types.ts` — `RegistryRun`, `RegistryVersion`, `TrainConfig`, `ExportOptions`, …
  - `runStatus.ts` — derives `waiting`/`running`/`stalled` (stale = >1h silent)
  - `metrics.ts` — metric alias normalization, client-side F1 from precision/recall
  - `openapi.ts` + `DeploymentSwaggerPanel.tsx` — generated OpenAPI + embedded Swagger UI

## How it works
- Auth via Supabase email/password; admin = `app_metadata.role == admin`. Read-only users
  can browse but not train/deploy/delete.
- Load: `getSession` → `refresh` (runs/versions/channels/deployments/metrics) →
  `setupRealtime` (postgres_changes) → 5s polling while any run is `running`.
- **Training form** parses classes from the uploaded dataset YAML (`parseYoloClasses`,
  `App.tsx:147`), shown **read-only**; captures hyperparams + ios/android quantize options;
  `startTraining` POSTs to `start-training`, falling back to a local run row if hosted
  training isn't configured.
- Version state is derived (archived via metadata, else channel membership, else inactive)
  — there is no `state` column.

## Gotchas / footguns
> [!warning] Hosted training is a **manual Colab hand-off**: the dashboard creates the run
> row, then the user opens the Colab notebook (`?run_id=…`), runs all cells, and pastes the
> service-role key. If Colab dies, the run sits `running` until flagged stalled (>1h).

> [!warning] `channels.current_version_id` vs `channel_deployments` duality applies here too
> — the store should read deployments. See [[model-registry-db]] / [[drift-register]].

## Related
- [[edge-functions]] · [[model-registry-db]] · [[compat-signature]] · [[training-driver]]
