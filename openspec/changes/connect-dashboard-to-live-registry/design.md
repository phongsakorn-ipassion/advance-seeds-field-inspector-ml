## Architecture

The dashboard keeps its current component tree. A new adapter boundary lives
under `apps/web/src/registry/`:

- `types.ts` — UI-shaped types (already used by the components).
- `api.ts` — interface every store implements (`getSnapshot`, `subscribe`,
  `deployVersion`, `undeployChannel`, `deleteInactiveArtifact`,
  `startTraining`).
- `demoStore.ts` — keeps the existing in-memory simulation behind the same
  interface so the app still runs without a Supabase project.
- `supabaseStore.ts` — talks to Supabase JS using the anon key and the user's
  session. RLS limits writes to admin users.
- `index.ts` — picks `supabaseStore` when `VITE_SUPABASE_URL` is set, else
  `demoStore`.

The Supabase store maps schema rows into the existing UI types so view
components do not change shape. Realtime subscriptions push `runs` and
`run_metrics` updates back into the store snapshot.

## Auth

`AuthProvider` wraps the app and exposes `{session, isAdmin, signIn, signOut}`.
The login screen calls `supabase.auth.signInWithPassword`. Admin status is
derived from `session.user.app_metadata.role === 'admin'`. Non-admin sessions
see read-only screens; the deploy, undeploy, train-start, and delete-artifact
buttons render disabled with a tooltip.

In demo mode, `AuthProvider` falls back to the existing demo email/password
check.

## Storage cleanup

A new Edge Function `storage-usage` runs under the service role:

- `GET /storage-usage` — sums `size_bytes` from `versions` (and any orphan
  artifacts the function tracks) and returns `{used_bytes, quota_bytes}`.
- `POST /storage-usage/delete` — body `{version_id}`. Requires the caller's
  JWT to carry `app_metadata.role = "admin"`. Verifies the version is not
  attached to any channel, deletes the R2 objects (`tflite_r2_key`,
  `mlmodel_r2_key`), and deletes the `versions` row.

The browser only ever sees the function URL; R2 credentials remain in
`SUPABASE_FUNCTIONS` env.

## Realtime

`supabaseStore` opens one channel per logged-in session:

- `postgres_changes` on `runs` filtered by `model_line_id`.
- `postgres_changes` on `run_metrics` filtered by run ids that are running.
- `postgres_changes` on `channels` so deploy/undeploy from another tab
  updates locally without a refresh.

## Environment

`apps/web/.env.example` documents:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_MODEL_LINE_SLUG=seeds-poc
VITE_STORAGE_QUOTA_MB=512
```

When `VITE_SUPABASE_URL` is empty, the demo store activates so local browsing
still works.

## Deploy

A GitHub Actions workflow `pages.yml` builds `apps/web` and publishes
`apps/web/dist` to GitHub Pages on push to `main`. The build runs without the
Supabase env vars set; if they are configured as repo variables they get baked
into the build at deploy time.

## Risks

- Realtime channels can leak if components unmount without unsubscribing —
  the store owns subscription lifecycles, components only read snapshots.
- Anon key in the browser is intentional; RLS is the security boundary, not
  the key.
- Demo mode must keep working so the dashboard is demonstrable without a
  Supabase project — the env-driven switch makes this explicit.
