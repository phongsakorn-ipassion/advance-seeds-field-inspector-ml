## Why

`apps/web` (the Model Registry dashboard) had no automated QA coverage — the only
verification was manual clicking. A behavior regression in the training form's
dataset-YAML parsing shipped silently and would have stayed invisible without a real,
running-app test pass. This change sets up the `ipassion-qa-automation` plugin's
Playwright page-object + test-case pipeline against `apps/web`'s demo mode, and uses the
first full run to find and fix that regression plus close a genuine gap in the
"non-admin session" requirement (demo mode had no way to produce a non-admin session at
all).

## What Changes

- Add a QA automation workspace (`src/web-portal/`) targeting `apps/web`: a
  `sys_summary.md` System Knowledge Base, a Playwright page-object layer
  (`components/`, `pages/`, `flows/`), and 22 test cases (schema 2.0) across
  AUTH/TRAIN/MODELS/STORAGE series plus a page-object smoke suite — all wired to
  `tests/test_*.py`, all `status: ready`, all passing (46/46 steps).
- Fix `parseYoloClasses()` in `apps/web/src/App.tsx`: the block-capture regex used `\s+`
  (which matches newlines) and so kept matching past the blank line after a dataset
  YAML's `names:` block into the next top-level key, silently rejecting any `names:`
  block followed by anything else in the file — the common case. Found by an AI-judged
  test run against `tests/fixtures/dataset_sample.yaml`.
- Add a demo-mode read-only test account (`demoReadOnly`,
  `apps/web/src/registry/demoStore.ts`) so demo mode can produce a non-admin session —
  previously only an admin demo credential existed, so the dashboard's own "non-admin
  session is read-only" requirement was untestable without a live Supabase project.

## Capabilities

### New Capabilities
(none — the QA workspace is test tooling, not a product capability; see Impact)

### Modified Capabilities
- `model-registry-web-dashboard`: "Admin login gates registry operations" gains a
  demo-mode read-only account scenario; "Training workflow captures config and live
  progress" gains a scenario locking down dataset-YAML class parsing across trailing
  YAML content.

## Impact

- `apps/web/src/App.tsx` — one-line regex fix (`parseYoloClasses`), no other behavior
  change.
- `apps/web/src/registry/demoStore.ts` — new `demoReadOnly` export, `signIn()` accepts a
  second credential pair.
- `src/web-portal/` (new) — QA automation workspace: page objects, test cases,
  `conftest.py`, fixtures. Runs against demo mode only; a real Supabase-backed
  environment still has no non-admin test account and needs one provisioned separately.
- No change to the frozen `configs/model_export_contract.json` or any training/export
  script.
