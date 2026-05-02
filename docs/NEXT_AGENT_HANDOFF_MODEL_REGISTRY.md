# Next Agent Hand-off - Model Registry Workflow

**Date:** 2026-05-02  
**Repo:** `/Users/ppungpong/Github/advance-seeds-field-inspector-ml`  
**Current branch:** `main`  
**Status:** local `main` is ahead of `origin/main`; push has not been done.

## Current State

This repo now contains the first three layers of the Advance Seeds model
registry workflow:

1. **Supabase + Cloudflare R2 backend foundation**
   - Database schema, RLS, `resolve-channel`, `upload-artifact`, SQL tests,
     Edge Function tests, CI workflow, and backend setup docs.
   - Main files:
     - `supabase/migrations/`
     - `supabase/functions/resolve-channel/`
     - `supabase/functions/upload-artifact/`
     - `.github/workflows/backend.yml`
     - `docs/backend-setup.md`

2. **Python Registry SDK**
   - Python client for service-role registry writes and signed artifact upload.
   - Training script opt-in lifecycle reporting.
   - Main files:
     - `src/advance_seeds_ml/registry/`
     - `tests/test_registry.py`
     - `scripts/train_yolo26n_seg.py`

3. **Web Dashboard Demo Workflow**
   - Vite + React + TypeScript app under `apps/web`.
   - Static/local-state demo workflow, not yet live Supabase-backed.
   - Supports:
     - pre-created demo admin login gate
     - overview of production/staging, live training, and R2 usage
     - train-new-model form with default classes and hyperparameters
     - simulated Colab MCP live training progress/logs
     - auto-created candidate model after simulated training completes
     - model detail view with metrics, classes, hyperparameters, artifact info
     - deploy to staging/production and undeploy controls
     - R2 quota warning and inactive artifact deletion action
   - Main files:
     - `apps/web/src/App.tsx`
     - `apps/web/src/registryData.ts`
     - `apps/web/src/styles.css`
     - `apps/web/package.json`

## Important Current Limitation

The web dashboard is currently a **functional demo app using local React state**.
It is not yet wired to live Supabase Auth, Supabase tables, Realtime, Edge
Functions, Cloudflare R2 usage APIs, or actual Google Colab MCP execution.

The UI intentionally models the real workflow so the next agent can replace
local state with live services without redesigning the whole surface.

## Demo Admin Credentials

Defined in `apps/web/src/registryData.ts`:

```text
email: admin@advance-seeds.demo
password: demo-admin
role: admin
```

These are demo-only credentials for the local UI. Do not treat them as real
secrets.

## Validation Commands That Passed

Run from repo root:

```bash
python3 -m unittest discover -s tests
openspec validate --all --strict
```

Run from `apps/web`:

```bash
npm run build
```

Browser workflow was also checked at:

```text
http://127.0.0.1:5173
```

Verified path:

```text
login -> train -> live Colab MCP tracking -> model detail -> storage quota warning
```

## OpenSpec Changes

Active change folders with all tasks checked:

- `openspec/changes/add-model-registry-backend/`
- `openspec/changes/add-python-registry-sdk/`
- `openspec/changes/add-model-registry-web-dashboard/`

Other older completed changes are also still active. Do not assume active means
unfinished; inspect each `tasks.md`.

Archive is pending because `openspec archive` is interactive and was not run.

## Security / Ops Note

During earlier backend work, live Cloudflare R2 credentials were temporarily
written to a gitignored `.env.local` inside a deleted worktree. The credentials
were not committed, but the R2 API token should still be rotated in Cloudflare
before production use.

## Highest-value Next Work

The next agent should **wire the dashboard to live services** while preserving
the current workflow:

1. Add Supabase client config to `apps/web`.
2. Replace demo login with Supabase Auth / GitHub OAuth or email login.
3. Gate dashboard access on admin role (`app_metadata.role = "admin"`).
4. Replace `registryData.ts` sample state with query/mutation adapters.
5. Read live:
   - `model_lines`
   - `runs`
   - `run_metrics`
   - `versions`
   - `channels`
   - `channel_history`
6. Add Realtime subscription for `run_metrics` and running `runs`.
7. Wire deploy/undeploy buttons to update `channels` and insert audit history.
8. Wire training flow to a real job path:
   - Use Google Colab MCP to prepare/start notebook execution when interactive
     agent tools are available.
   - Keep Python SDK as the source for logging runs/metrics/artifacts.
9. Add R2 storage usage endpoint or Edge Function:
   - report total storage usage
   - identify inactive artifacts
   - delete inactive artifacts through an admin-only function
10. Add GitHub Pages deployment workflow for `apps/web`.

## Recommended Implementation Order

1. **Create/extend OpenSpec first**
   - Add a new change such as `connect-dashboard-to-live-registry`.
   - Requirements should cover admin auth, live queries, channel mutations,
     Realtime metric tracking, storage usage/delete, and GitHub Pages deploy.

2. **Add environment contract**
   - `apps/web/.env.example`
   - Variables likely needed:
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`
     - optional `VITE_MODEL_LINE_SLUG=seeds-poc`

3. **Introduce data adapter boundary**
   - Keep UI components mostly intact.
   - Move local state mutations behind an adapter layer, for example:
     - `src/registry/api.ts`
     - `src/registry/types.ts`
     - `src/registry/demoStore.ts`
     - `src/registry/supabaseStore.ts`

4. **Auth first**
   - The app should show login until authenticated.
   - Only admin users should see write controls.
   - Non-admin authenticated users can be read-only or blocked.

5. **Live read path**
   - Replace overview/model/run/storage reads step by step.

6. **Write path**
   - Deploy/undeploy channel mutation.
   - Storage delete through an Edge Function.
   - Training launch/Colab handoff after reads/writes are stable.

7. **Verification**
   - `npm run build`
   - `python3 -m unittest discover -s tests`
   - `openspec validate --all --strict`
   - Browser check login and workflow paths.

## Do Not Do

- Do not put R2 credentials in the browser.
- Do not bypass Supabase RLS from client code.
- Do not store service-role keys in Vite env variables.
- Do not remove the current demo workflow while adding live data.
- Do not treat Google Colab MCP as a permanent backend service; it is an
  agent-assisted training path for the demo workflow.
- Do not add a custom backend server unless the Edge Function/Supabase route is
  clearly insufficient.

## Paste-ready Prompt For Another Agent

```text
You are working in:
/Users/ppungpong/Github/advance-seeds-field-inspector-ml

Goal:
Continue the Advance Seeds model registry web app from the current hand-off.
Read docs/NEXT_AGENT_HANDOFF_MODEL_REGISTRY.md first, then inspect the live code.

Current state:
- Backend registry exists under supabase/: Postgres schema, RLS, Edge Functions
  resolve-channel and upload-artifact, R2 signed URL helpers, SQL tests, and CI.
- Python Registry SDK exists under src/advance_seeds_ml/registry/.
- Training script scripts/train_yolo26n_seg.py supports opt-in registry lifecycle
  reporting.
- Web dashboard exists under apps/web/ and implements the full demo workflow
  using local React state: admin login, overview, train form, simulated Colab MCP
  progress, candidate creation, model detail, deploy/undeploy, and storage quota
  cleanup.
- The dashboard is NOT yet live Supabase-backed.

Your task:
Wire the dashboard to live services while preserving the existing workflow and
minimal operational design.

Required approach:
1. Follow OpenSpec. Create a new change under openspec/changes before code, for
   example connect-dashboard-to-live-registry.
2. Add requirements for:
   - Supabase admin login
   - live registry reads
   - run/metric Realtime tracking
   - deploy/undeploy channel writes
   - R2 storage usage warning and inactive artifact deletion
   - GitHub Pages deploy
3. Use TDD where practical. Add tests for adapter functions and keep UI behavior
   easy to verify.
4. Keep service-role and R2 secrets out of browser code. Browser uses anon key
   and RLS only. Admin-only destructive storage work must go through an Edge
   Function.
5. Preserve the current UI workflow; replace local state with a clean data
   adapter boundary rather than rewriting the entire app.

Important files:
- docs/NEXT_AGENT_HANDOFF_MODEL_REGISTRY.md
- docs/model-registry-handoff.md
- apps/web/src/App.tsx
- apps/web/src/registryData.ts
- apps/web/src/styles.css
- supabase/migrations/
- supabase/functions/resolve-channel/
- supabase/functions/upload-artifact/
- src/advance_seeds_ml/registry/
- scripts/train_yolo26n_seg.py

Validation commands:
From repo root:
python3 -m unittest discover -s tests
openspec validate --all --strict

From apps/web:
npm run build

Browser validation:
Run apps/web dev server and verify:
login -> overview -> train -> live tracking -> model detail -> deploy/undeploy
-> storage quota warning/delete inactive artifact.

Known pending manual item:
Rotate the Cloudflare R2 token before production use. Earlier credentials were
only in gitignored local files, not committed, but should still be rotated.
```
