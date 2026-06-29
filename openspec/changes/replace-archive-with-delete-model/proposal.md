# replace-archive-with-delete-model

## Why
The Model detail screen offers an "Archive model" action that soft-deletes a
version: it deletes the R2 artifacts but keeps the `versions` row, flagging it
via `metadata.archived_at` so it lingers in Model versions as an "archived
history record". Operators asked for a true delete — the entry should disappear
from Model versions and all related data should go, not just the artifacts.

The hard-delete plumbing already exists (`storage-usage/index.ts::handleDelete`
and the `POST /storage-usage/delete` route); the UI just never used it.

## What changes
- Rename the Model detail action from **Archive model** to **Delete model**
  (label, icon, title, confirmation copy). It now calls the existing `delete`
  path instead of `archive`.
- The store API renames `archiveVersion` → `deleteVersion`
  (`api.ts`, `supabaseStore.ts`, `demoStore.ts`); the demo store performs a real
  hard delete of the snapshot row instead of flipping `state` to `archived`.
- `handleDelete` gains **parent-run cleanup**: after deleting the version row it
  deletes the version's training `run` (and, via cascade, its `run_metrics`)
  **only when no sibling version still references that run** (`versions.run_id`
  is `ON DELETE SET NULL`, so a shared run must survive).
- The existing guards are unchanged: delete is admin-only and blocked while the
  version is attached to a channel or has an active deployment (HTTP 409).
- The soft-archive concept (metadata flags, the "Archived" filter, the
  "Archived history record" label) is retained for any rows archived before this
  change; no new rows enter that state.

## Impact
- Modified: `apps/web/src/App.tsx`, `apps/web/src/registry/api.ts`,
  `apps/web/src/registry/supabaseStore.ts`, `apps/web/src/registry/demoStore.ts`,
  `supabase/functions/storage-usage/index.ts`, plus Vitest + Deno tests.
- Specs: `model-registry`, `model-registry-web-dashboard`.
- Not impacted: artifact filename contract, R2 helper, RLS (delete still routes
  through the service-role Edge Function), training worker.
