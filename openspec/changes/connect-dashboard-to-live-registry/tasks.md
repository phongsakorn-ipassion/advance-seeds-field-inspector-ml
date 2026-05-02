## 1. OpenSpec

- [x] 1.1 Add proposal, design, and modified dashboard requirements.
- [x] 1.2 Validate the change with `openspec validate --all --strict`.

## 2. Adapter Boundary

- [x] 2.1 Create `apps/web/src/registry/types.ts` with UI-facing types.
- [x] 2.2 Create `apps/web/src/registry/api.ts` with the store interface.
- [x] 2.3 Move existing in-memory state into `apps/web/src/registry/demoStore.ts`.
- [x] 2.4 Add `apps/web/src/registry/index.ts` that selects the active store
      from `VITE_SUPABASE_URL`.

## 3. Live Supabase Store

- [x] 3.1 Add `@supabase/supabase-js` dependency.
- [x] 3.2 Implement `supabaseStore.ts` with read queries for `model_lines`,
      `runs`, `run_metrics`, `versions`, `channels`, and `channel_history`.
- [x] 3.3 Add Realtime subscriptions for runs, run_metrics, and channels.
- [x] 3.4 Implement deploy, undeploy, and start-training writes.
- [x] 3.5 Add `apps/web/.env.example`.

## 4. Auth

- [x] 4.1 Add a session subscription with `isAdmin` derived from
      `app_metadata.role`.
- [x] 4.2 Replace the demo login form with Supabase Auth (email + password)
      while keeping demo mode as a fallback.
- [x] 4.3 Disable write controls when the session is not admin.

## 5. Storage Cleanup Edge Function

- [x] 5.1 Add `supabase/functions/storage-usage/index.ts` with GET (usage)
      and POST (delete) handlers.
- [x] 5.2 Verify admin role on the JWT before deleting; return 403 otherwise.
- [x] 5.3 Delete the R2 object and the `versions` row in a single request.
- [x] 5.4 Add unit/contract tests using the existing function test harness.

## 5b. Design System Alignment

- [x] 5b.1 Vendor light-mode tokens from the demo (`tokens.css`).
- [x] 5b.2 Rewrite `styles.css` to use tokens for every color, space, and radius.
- [x] 5b.3 Replace sidebar shell with a sticky topbar; use `Sprout` brand mark.
- [x] 5b.4 Update spec with design-DNA requirement scenarios.

## 6. GitHub Pages Deploy

- [x] 6.1 Add `.github/workflows/pages.yml` that builds `apps/web` and
      uploads the `dist` artifact.
- [x] 6.2 Configure the Pages action to deploy on push to `main`.

## 7. Validation

- [x] 7.1 Run `npm run build` in `apps/web`.
- [x] 7.2 Run `python3 -m unittest discover -s tests`.
- [x] 7.3 Run `openspec validate --all --strict`.
- [ ] 7.4 Verify demo mode still works in the browser without env vars.
