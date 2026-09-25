analyzed_commit: 5cd779a210215869f95b1ebd5ad6361198060ff9
analyzed_at: 2026-09-25

# System Knowledge Base — Advance Seeds Model Registry Web Dashboard

Scope: `apps/web/` in `advance-seeds-field-inspector-ml`. This is a single-page React app for browsing/managing ML training runs, model versions, and staging/production deployment channels backed by Supabase Postgres, with artifacts in Cloudflare R2. It is a **client-only SPA with no client-side router** — there is exactly one URL, and "pages" are React state, not routes.

## 1. Overview + Tech Stack

- **Purpose**: internal ops console for ML engineers to (a) kick off training runs (hand off to a Colab notebook), (b) watch live training progress/metrics via Supabase Realtime, (c) review completed model versions and their exported artifacts (TFLite/Android, Core ML/iOS, PyTorch), and (d) deploy/undeploy versions to `staging`/`production` channels and manage R2 storage quota.
- **Framework**: React 19 + TypeScript, built with Vite 6 (`apps/web/vite.config.ts`, `base: "./"` — relative asset paths, no router base needed).
- **Routing**: **none**. `apps/web/src/App.tsx` renders one `<App/>` component; navigation is done via `useState<Section>` (`"overview" | "train" | "models" | "storage"`) and top-bar buttons, not `<a href>`/history API. There is no deep-linking — refreshing the page always returns to `overview` (or the login screen if unauthenticated). A tester cannot navigate to a "page" by URL; navigation must be done by clicking nav buttons.
- **Entry point**: `apps/web/src/main.tsx` mounts `<App/>` into `#root` (see `apps/web/index.html`).
- **State management**: a single external store (`RegistryStore`, `apps/web/src/registry/api.ts`) subscribed to via `useSyncExternalStore`. Two implementations selected at boot by `createRegistryStore()` (`apps/web/src/registry/index.ts`):
  - `createSupabaseStore` (`apps/web/src/registry/supabaseStore.ts`) — used when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are both set.
  - `createDemoStore` (`apps/web/src/registry/demoStore.ts`) — **in-memory demo/mock mode**, used whenever either env var is missing. This is the default for a bare checkout with no `.env.local`.
- **Auth model**: Supabase Auth, **email + password** (`client.auth.signInWithPassword`). There is **no magic link / OTP / OAuth** anywhere in the code. Admin vs read-only is derived client-side from the JWT's `app_metadata.role === "admin"` (`applySession()` in `supabaseStore.ts`); this is a UI-only gate — actual write authorization is enforced server-side by Postgres RLS / Edge Function role checks, not by the frontend.
- **Backend calls**:
  - Direct Supabase Postgres reads via `@supabase/supabase-js` (`.from("runs")`, `.from("versions")`, `.from("channels")`, `.from("channel_deployments")`, `.from("run_metrics")`, `.from("model_lines")`).
  - Supabase Edge Functions (`supabase/functions/`) for privileged/dataset/artifact operations: `start-training`, `upload-dataset`, `download-artifact`, `storage-usage/delete`, `storage-usage/archive`. (`list-deployed-models` and `resolve-channel` are consumed by the **mobile app**, not this dashboard, though the in-app "API explorer" Swagger panel documents them for manual testing.)
- **Test runner**: Vitest (`apps/web/package.json` → `"test": "vitest run"`). Existing specs: `registry/demoStore.test.ts`, `registry/deploymentLabels.test.ts`, `registry/exportOptions.test.ts`, `registry/metrics.test.ts`, `registry/openapi.test.ts`, `registry/runStatus.test.ts`, `registry/supabaseStore.test.ts`. These are unit tests of the store logic, not DOM/component tests — there is no existing Testing-Library/Playwright suite to mine for selectors.
- **Dev server**: `npm run dev` → `vite --host 127.0.0.1` → **http://127.0.0.1:5173**.

## 2. Route Map

There are no URL routes. The single document (`/index.html` under Vite `base: "./"`) always serves the same SPA shell. "Screens" are gated purely by client state:

| Screen (state) | Reachable when | Entry point |
|---|---|---|
| Login screen | `session === null` (no active Supabase session, or demo store with no sign-in yet) | `App()` returns `<LoginScreen/>` early — see `App.tsx` line ~722 |
| Overview | `session != null`, `section === "overview"` (default after login) | top nav button "Overview" |
| Train pipeline | `section === "train"`, sub-tab `trainTab` = `"form" \| "live" \| "recent"` | top nav "Train" |
| Models (lifecycle) | `section === "models"` | top nav "Models" |
| Storage | `section === "storage"` | top nav "Storage" |

No auth guard exists per-section — once logged in, all four sections are reachable regardless of role; **write actions** (deploy, undeploy, delete, rename, start training, upload dataset) are gated by `isAdmin` (button `disabled` + tooltip "Admin role required"), not by hiding the section.

- **Viewports**: no responsive breakpoints/media queries were found driving layout logic in the read files; treat this as a desktop-oriented admin console. Confirm actual CSS breakpoints in `apps/web/src/styles.css` / `tokens.css` if mobile-viewport testing is required (not enumerated here — only what's load-bearing was inspected).

## 3. Page Inventory

### Login screen (`LoginScreen`, `App.tsx` ~967)
- Elements:
  - Brand header ("Advance Seeds" / "Model Registry")
  - One-click admin button: `<button className="admin-card">` containing `<strong>Sign in as Admin</strong>` and `<span>{preset.email}</span>`
  - "Use a different account" ghost button (`<button className="ghost-button compact">Use a different account</button>`) toggles a manual form
  - Manual form (`<form className="manual-login">`): email `<input type="email" autoComplete="email" placeholder="you@advanceseeds.com">`, password `<input type="password" autoComplete="current-password" placeholder="••••••••">`, submit `<button className="primary-button" type="submit">Sign in</button>` (disabled while `busy` or either field empty), Cancel button
- States: default (admin-card only), manual-form-open, submitting (`busy` → button disabled, no explicit "Signing in…" text change on submit button itself), error (`<p className="form-error">` shown only in manual mode, cleared on retry)
- No loading/empty states beyond the above — this is a static form.
- Exit transition: successful `signIn()` flips `session` non-null → `App()` re-renders past the login gate into Overview.

### Overview (`Overview`, `App.tsx` ~1067)
- 4 `MetricCard`s: Production (`version.semver` or "Undeployed"), Staging (`semver` or "Unset"), Training (running run name or "Idle"), R2 storage (`"{used} / {quota} MB"`, turns `danger` styled if over quota).
- "Operator journey" panel with 4 static `Step`s (Train/Track/Deploy/Clean) and a `<button className="primary-button">Start training</button>` that jumps to Train section.
- "Live runs" panel: `RunList` of up to 4 `status === "running"` runs, or `EmptyState` ("No live runs" / "Reported by the Python SDK; click any run to open its full detail in the Train pipeline.") when none.
- Clicking a run row calls `onOpenRun` → jumps to Train section, `live` or `recent` tab depending on run status.

### Train pipeline (`TrainWorkflow`, `App.tsx` ~1128)
Sub-nav tabs: "Train new model" (form), "Live tracking" (badge = count of running runs), "Recent runs", plus an info button "How training runs" opening a `Modal`.

- **Train new model** tab: a form with:
  - Dataset config field (`DatasetConfigField`): free-text input + "Upload .yaml" button (opens native file picker, accepts `.yaml/.yml`); parses the YAML `names:` block client-side to populate Classes, uploads via `store.uploadDataset()` → Edge Function `upload-dataset` (R2 presign) → PUT to R2.
  - Dataset image bundle field (`DatasetBundleField`): free-text input + "Upload .zip" button; rejects non-`.zip` client-side with `"Dataset image bundle must be a .zip file."`
  - Source weights `<select>` with 5 fixed options: `yolo26n-seg.pt` … `yolo26x-seg.pt`.
  - Read-only "Classes" chip list, populated only from a parsed dataset YAML.
  - Epochs / Image size number fields; `<details>` "Advanced hyperparameters" (Patience, Batch `<select>` `auto|8|16|32|64`).
  - Note `<textarea>`.
  - Quantization checkboxes for iOS and Android exports (both default checked/true).
  - Submit `<button type="submit" className="primary-button">Create training run</button>` (disabled unless `isAdmin`).
- **Live tracking** tab: `RunList` of running runs (with a delete icon-button for stalled/waiting runs) + a run detail panel (`detailPanel`) that opens when a row is clicked, or `EmptyState` "No runs in progress".
- **Recent runs** tab: `RunList` of non-running runs (max 6) + same detail panel, or `EmptyState` "No prior runs".
- **Run detail panel** (`detailPanel`, shown in both Live and Recent tabs when `focusedRunId` set): header with run name/id/hardware/notebook, "Open in Colab" external link (only shown when display status is `waiting`/`queued`), Close button, `ColabManualSteps` 6-step checklist (collapsed `<details>` by default), `RunMetricsPanel` (metric toggle chips + SVG trend chart), `RunProgress` bar, `RunLogs` (`<pre>`, "No logs reported yet." when empty), `InfoSection` (training config / dataset split / hyperparameters).
- Delete-run confirmation `Modal`: title "Delete timed-out run" or "Delete waiting run" depending on stalled vs waiting state; confirm button text toggles `"Delete run"` ↔ `"Deleting…"`.

### Models (lifecycle) (`ModelsWorkflow`, `App.tsx` ~1744)
- Left panel: Channel filter `<select>` (`all|staging|production|candidate|inactive|archived`), Sort `<select>` (`created|performance|map50|maskMap`), scrollable list of `version-card` buttons (semver, mAP50/mask% summary, deployment label chips). Empty state: "No matching versions" / "Adjust channel or performance filters to see more model versions."
- Right panel — Model detail (`ModelDetail`, `App.tsx` ~1954): rename-in-place (pencil icon → inline form → Save/Cancel), Performance (F1 hero metric + 6 metric pairs), `PlatformReadiness` (3 `PlatformArtifactCard`s: Android/iOS/Local-QA-PyTorch, each with a Download icon-button that opens the signed R2 URL in a new tab via `window.open`), Description (editable textarea, Save/Cancel, error `<p className="form-error">`), Deployment section (mobile deployment chip, collapsible "API test tools" `<details>` containing Guide/Collection external links and the Swagger "API explorer" panel), InfoSection (training config/dataset/hyperparameters), and a lifecycle action bar (Deploy to Prod, Deploy to Staging, Undeploy per channel, Set {channel} default, Delete model) each wrapped in a confirmation `Modal`.
- Empty state when no version selected: "No model selected".

### Storage (`StorageWorkflow`, `App.tsx` ~1845)
- Quota banner (`storageUsed.toFixed(1)} MB used` / `{percent}% of {quota} MB demo quota`; `quota-banner danger` + "Over quota. Delete inactive model records." when over budget) and a bar chart div.
- Storage row list: semver, R2 key, size, `active`/`inactive` status pill, "Open model" shortcut icon-button, "Delete model" danger button (disabled while `active` or non-admin, title text explains why).
- Delete confirmation `Modal`: "Delete the stored artifact for {semver}. This permanently removes the model version and cannot be undone."

## 4. Key User Flows

1. **Sign in (admin one-click)**: Login screen → click `.admin-card` → `store.signIn(preset.email, preset.password)` → on success `session.isAdmin === true` → lands on Overview.
2. **Sign in (manual/read-only)**: Login screen → "Use a different account" → fill email+password → Submit → on failure shows `<p className="form-error">` with the thrown message; on success lands on Overview.
3. **Start a training run**: Train → "Train new model" tab → upload a dataset YAML (populates Classes + dataset stats) → optionally upload a dataset image ZIP → pick Source weights → adjust hyperparameters → Create training run → client-side validation errors block submit (see §5) → on success, tab auto-switches to "Live tracking" and a new "waiting" run row appears (Supabase mode: DB insert or `start-training` Edge Function call; falls back to a local DB insert row if the Edge Function 404/503s or returns `hosted_training_not_configured`) → tester must manually open the run detail and follow the 6-step Colab checklist; the run only starts producing real progress once metrics arrive via Realtime.
4. **Track a live run**: Train → "Live tracking" → click a run row → detail panel opens with metrics chart, progress bar, logs → progress/metrics update live via Supabase Realtime subscriptions (no polling button — automation must wait for DOM changes, not a fixed timeout, except that there IS a 5s poll fallback while any run is `running`, see §8).
5. **Delete a stuck run**: Live tracking → a "waiting" or "stalled" (no activity >1h) run shows a trash icon → click → confirmation `Modal` (copy differs for stalled vs waiting) → confirm → `store.deleteRun()`.
6. **Promote/deploy a model version**: Models → select a version card → in Model detail, "Deploy to Prod" or "Deploy to Staging" → confirmation modal → confirm → deploys as **non-default selectable** deployment (does not overwrite the channel's current default) → separately, "Set {channel} default" promotes it to the channel's resolved default (what `resolve-channel`/mobile consumers actually get).
7. **Undeploy / delete a version**: Model detail action bar → "Undeploy {channel}" (per deployed channel) → confirm; "Delete model" is disabled while the version is deployed to any channel (`isActive`), tooltip explains why; deleting removes artifacts + version + (if unshared) its training run.
8. **Download an artifact**: Model detail → Artifact readiness → Download icon on Android/iOS/Local QA card → `store.downloadArtifact(r2Key)` → Edge Function `download-artifact` returns a **time-limited presigned R2 URL** (15 min TTL server-side) → opened via `window.open(url, "_blank")`. **Never assert on or hardcode this URL as test data** — it's single-use-window and expires.
9. **Storage cleanup**: Storage tab → find an `inactive` row → Delete model (disabled while active) → confirm modal → `store.deleteInactiveArtifact()`.
10. **API explorer (manual API testing)**: Model detail → Deployment section → expand "API test tools" → "Open Swagger" → **opens a new browser tab/window** built from a Blob URL running an embedded Swagger UI (loaded from `unpkg.com` CDN) preloaded with the model's OpenAPI spec and an `apikey`/`Authorization` request interceptor. This is a genuine popup window, not a same-tab navigation — automation needs popup-window handling.

## 5. Validation / Business Rules (exact error text)

| Field/Action | Rule | Exact text shown |
|---|---|---|
| Dataset image bundle upload | Must be `.zip` | `"Dataset image bundle must be a .zip file."` |
| Train form — Dataset config | Required, non-blank | `"Dataset config is required."` |
| Train form — Dataset image bundle | Required, non-blank | `"Dataset image bundle is required."` |
| Train form — Source weights | Required (must pick from the 5-option select) | `"Source weights are required."` |
| Train form submit | Blocked entirely (no request sent) unless `isAdmin` (button `disabled`) | tooltip `"Admin role required"` |
| Login (manual) — failure | Wraps thrown error message; demo mode always throws | `"Invalid demo admin credentials."` (demo mode); Supabase mode surfaces the raw Supabase Auth error message |
| Write action without admin role | `adminWrite()` guard throws before any network/DB call | `"Admin role required."` |
| Deploy an archived version | Blocked in both store impls | `"Archived models cannot be deployed."` |
| Set channel default without an existing deployment | | `"Deploy this model to the channel before making it the default."` |
| Rename version — empty name | | `"Version name cannot be empty."` |
| Rename version — duplicate semver | Demo store: any existing version; Supabase store: Postgres unique-constraint violation (`error.code === "23505"`) | `` Version "{next}" already exists. `` |
| Delete run failure (Supabase) | Wraps Postgres error with code/details/hint | `` Failed to delete run: {message} · code=... · ... `` |
| Deploy/undeploy/set-default DB error (Supabase) | via `storeError()` helper | `` Failed to add deployment to {channel}: ... ``, `` Failed to undeploy from {channel}: ... ``, `` Failed to set {channel} default: ... ``, `` Failed to reset {channel} defaults: ... `` |
| `start-training` non-2xx (not a "not configured" fallback case) | | `` body.error ?? `start-training failed: {status}` `` |
| `upload-dataset` presign failure | | `` upload-dataset presign failed: {status} {body} `` |
| R2 direct PUT failure | | `` R2 PUT failed: {status} {body} `` |
| `download-artifact` failure | | `` body.error ?? `Download failed: {status}` `` (Edge Function itself returns e.g. `"admin or service_role required"` (403), `"r2_key required"` (400), `"r2_key must look like runs/<run-id>/<artifact>.tflite, .mlpackage.zip, or .pt"` (400)) |
| `storage-usage/{delete\|archive}` failure | | `` {Delete\|Archive} failed: {status} {body} `` |
| iOS artifact missing on a deployed version | Non-blocking warning, not a form error tied to a field | `"iOS consumers will see this deployment as artifact_missing until Core ML export succeeds."` |
| Deploy-model card, missing artifact | Status chip text | `"Missing"` (or `"Failed"` if `precision === "failed"`) |
| Undeployed model, no deployment section content | | `"Not deployed to staging or production. Mobile apps cannot list or resolve this model until it is deployed."` |
| Delete model while active on a channel | Button disabled | tooltip `"Undeploy this model before deleting it"` |

Business rules to note for test design (not error strings, but behavior):
- `DisplayStatus` derivation (`registry/runStatus.ts`): a `running` run with `progress === 0` and no `map50`/`maskMap` yet is displayed as **"waiting"**, not "running". A `running` run silent for **> 1 hour** (`STALE_RUN_THRESHOLD_MS`) is displayed as **"stalled"**. Only `waiting`/`stalled` runs are deletable from the UI.
- Deploying to a channel does **not** automatically make the version the channel default — "Deploy" and "Set default" are two separate, separately-confirmed actions.

## 6. Selector Catalog

General warning: this app uses **no `data-testid` attributes anywhere** in the read source. Rely on `aria-label`, visible text/role, and a small number of stable `className`s. Many `className`s are static BEM-ish utility names (e.g. `primary-button`, `ghost-button`, `danger-button`, `form-error`) and are reasonably stable, but several are combined dynamically with template strings (e.g. `` status-pill ${status} ``, `` run-row ${onClick ? "clickable" : ""} ${selected ? "selected" : ""} ``, `` platform-card ${tone} ${cardStateClass} ``) — **do not select on the compound class string**; select on the stable prefix (`.status-pill`) plus text content, or on `aria-label`/role instead.

Per-page selectors:

**Login**
- Admin one-click: `button.admin-card` (contains `<strong>Sign in as Admin</strong>`)
- Toggle manual form: text `"Use a different account"`
- Manual email/password: `input[type="email"]` / `input[type="password"]` (no `id`/`name`, only `autoComplete`)
- Submit: `button[type="submit"]` with text `"Sign in"`
- Error: `p.form-error`

**Top bar / nav (present on every authenticated screen)**
- Section nav buttons: `nav.topbar-nav button` — match by visible text `Overview|Train|Models|Storage`; active tab gets class `active` appended (dynamic — match by text, not class)
- Notifications bell: `button[aria-label^="Activity notifications"]` (label includes unread count dynamically, e.g. `"Activity notifications, 3 unread"` — **match with a prefix/contains check, not exact string**)
- Notification popover: `div[role="dialog"][aria-label="Activity notifications"]`
- Sign out: `button[aria-label="Sign out"]`
- Toast stack: `div[aria-label="New activity notifications"]` (`aria-live="polite"`)

**Train**
- Sub-nav: `aside[aria-label="Train pipeline navigation"] button` — text `"Train new model" | "Live tracking" | "Recent runs"`
- Dataset YAML upload: `button` with text `"Upload .yaml"` (native `<input type="file" accept=".yaml,.yml,...">` created dynamically off-DOM via `document.createElement("input")` — **it is never attached to the DOM**, so Playwright/Testing-Library `setInputFiles` on a queried element won't work; you must intercept the file chooser event (e.g. Playwright's `page.on("filechooser")`) triggered by `input.click()`.
- Dataset ZIP upload: same pattern, button text `"Upload .zip"`.
- Source weights: `select` — options have stable `value`s: `yolo26n-seg.pt`, `yolo26s-seg.pt`, `yolo26m-seg.pt`, `yolo26l-seg.pt`, `yolo26x-seg.pt`.
- Submit: `button[type="submit"]` text `"Create training run"`
- Field errors: `p.form-error.field-error`
- Run rows: `div.run-row-wrapper` → `button.run-row[aria-pressed]`; delete icon `button[aria-label^="Delete "]` (label is `` Delete ${waiting|timed-out} run ${run.name} `` — dynamic, match by prefix); open-model shortcut `button[aria-label^="Open trained model "]`
- Run detail close: `button[aria-label="Close run detail"]`
- Colab link: `a[aria-label^="Open in Colab"]`
- Manual steps checklist: `div[aria-label="Manual Colab steps"]`, run-id copy `button[aria-label="Copy run id"]`
- Metrics chart controls: `button[aria-label="Show epoch points" | "Hide epoch points"]`, `button[aria-label="Zoom out chart" | "Zoom in chart" | "Reset chart zoom"]`

**Models**
- Version filter/sort: two `select` elements inside `.version-controls` (no labels beyond visible `<span>Channel</span>` / `<span>Sort</span>` — use `getByLabelText` carefully since it's `<label><span>...</span><select>` structure, or target by DOM order)
- Version card: `button.version-card` (gets `selected` class dynamically — don't rely on it)
- Rename: pencil `button[aria-label="Rename version"]`
- Download artifact: `button[aria-label="Download Android runtime" | "Download iOS runtime" | "Download Local QA weights"]` — **opens `window.open` to a signed, time-limited R2 URL; never assert on / store this URL.**
- Deploy/undeploy/set-default/delete buttons: no aria-labels, match by visible text `"Deploy to Prod"`, `"Deploy to Staging"`, `` Undeploy ${channel} ``, `` Set ${channel} default ``, `"Delete model"` — all inside `div.detail-actions-bar`.
- "Open Swagger" (opens a new tab/window with a Blob URL, third-party CDN dependency `unpkg.com`): `button` text `"Open Swagger"` inside `section[aria-label="API explorer"]`.
- Modal generic wrapper: `div[role="dialog"][aria-modal="true"][aria-label="{modal title}"]` — title varies per action (e.g. `"Deploy to production"`, `"Delete model"`) so assert on the dynamic `aria-label` text rather than a fixed selector.

**Storage**
- Storage rows: `article.storage-row`
- Delete: `button` text `"Delete model"` inside each row, `disabled` while artifact `active` or non-admin.

## 7. Auth & Test Data

- **Mechanism**: Supabase Auth email+password only (`client.auth.signInWithPassword`). Sessions persist via `persistSession: true, autoRefreshToken: true` in the Supabase client config (localStorage-backed by supabase-js default), so a signed-in session survives a page reload.
- **Role model**: `isAdmin` is read from the JWT's `app_metadata.role === "admin"`. Non-admin ("read-only") accounts can view everything but every write button is `disabled` with a `"Admin role required"` tooltip and every store write function double-checks via `adminWrite()`, throwing `"Admin role required."` if bypassed.
- **Mode switch (critical for QA)**: which backend is live depends entirely on whether `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set at build/dev time (`apps/web/.env.local`, gitignored; template at `apps/web/.env.example`). **If unset, the app silently runs the in-memory demo store** — no network calls, no real Supabase project needed, data resets on page reload. Confirm which mode the target QA environment is running before writing tests that expect persistence or Realtime.
- **Test accounts**:
  - Demo mode admin (hardcoded, `registry/demoStore.ts`): `admin@advance-seeds.demo` / `demo-admin`. This is the literal credential pre-filled behind the one-click "Sign in as Admin" button when running in demo mode.
  - Supabase mode admin preset shown on the login screen (`App.tsx` `adminPreset.supabase`): `alex@advanceseeds.com` / `DemoSeeds2026!` — **this account must actually exist in whichever Supabase project the deployed dashboard points at**; it is not provisioned by this repo's code and its real password may differ per environment. Verify against the live project before relying on it.
  - No read-only test account is hardcoded anywhere in source — any non-admin account must be provisioned server-side (Supabase Auth user without `app_metadata.role: "admin"`).
- **Env vars relevant to test config**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MODEL_LINE_SLUG` (defaults `"seeds-poc"` — scopes all queries to one `model_lines` row), `VITE_STORAGE_QUOTA_MB` (default `512`, purely a UI display denominator, not enforced client-side).
- **Server-side mock/seed data**: the actual rows in Supabase (`runs`, `versions`, `channels`, `channel_deployments`, `run_metrics`, `model_lines`) for a live environment are **not knowable from this frontend source** — they depend on `supabase/migrations/` seed data and whatever training runs have actually been recorded. Do not assume specific version semvers or run names exist in a live Supabase-backed environment; only the **demo mode** dataset (below) is deterministic.
- **Demo-mode fixed dataset** (`registry/demoStore.ts`, useful as deterministic assertion targets when testing against demo mode):
  - Channels: `staging → version-seeds-v2-100` (semver `1.0.0-seeds-v2`), `production → version-seeds-v1-092` (semver `0.9.2-seeds-v1`)
  - Extra inactive version: `version-old-v1-070` (semver `0.7.0-archive`, state `inactive`)
  - Storage quota: 512 MB.
  - **Demo mode auto-advances state on a `setInterval(advance, 1500)`** — background runs/metrics tick forward every 1.5s even with no user interaction. Tests against demo mode must account for this ambient state drift, not just user-triggered changes.

## 8. QA Risk / Quirks

- **No URL routing** — cannot deep-link into a specific tab/version; every test must drive navigation through clicks starting from Overview after login. Page-object "goto" methods must simulate clicks, not `page.goto(url)`.
- **Supabase Realtime is load-bearing for the Train and Models views.** `supabaseStore.ts` subscribes to `postgres_changes` on `runs`, `run_metrics`, `channels`, `channel_deployments`, `versions` and calls `refresh()` on any change — training progress, metrics charts, and deployment state updates arrive **asynchronously and without a page reload**. Automated assertions after a write (e.g. "deploy version") must **wait for the resulting DOM change** (e.g. poll for the new status pill / `aria-live` region), not use a fixed sleep, since Realtime delivery timing is not deterministic. There is also a **5-second interval poll** as a Realtime fallback (`setupActiveRunPolling` — only polls while at least one run is `status === "running"`), plus a `visibilitychange` listener that force-refreshes on tab focus — so background-tab test runners (headless with backgrounded tabs) may see different refresh timing than a foregrounded browser.
- **File uploads use a detached, DOM-less `<input type="file">`.** `DatasetConfigField`/`DatasetBundleField` call `document.createElement("input")` and `.click()` it directly rather than rendering a queryable file input. Standard `locator.setInputFiles()` against a page selector will not find this element — automation must intercept the native file-chooser dialog (e.g. Playwright `page.on("filechooser")`) instead.
- **Artifact downloads and the API explorer both open new browser tabs/windows** (`window.open`) — Android/iOS/PyTorch download buttons open a **time-limited presigned R2 URL** (~15 min TTL per `download-artifact` Edge Function `presignGet(key, 900)`; the mobile `list-deployed-models` function uses a 3600s/1hr TTL for its own URLs), and "Open Swagger" opens a `Blob:` URL page that pulls `swagger-ui-bundle.js` from `unpkg.com` at runtime (an **external network dependency** — will fail/hang in network-isolated CI). Automation must (a) handle popup windows, (b) never hardcode or re-use a captured R2 URL across test runs, and (c) either allow-list `unpkg.com` or skip the Swagger-panel scenario in offline CI.
- **Toasts auto-dismiss after 5.2s** (`window.setTimeout(..., 5200)` in `App.tsx`) and the toast stack shows only the 3 most recent — a slow test runner can miss a toast assertion window; prefer asserting on the underlying state change (e.g. run status pill) over the ephemeral toast.
- **"Stalled" run detection depends on wall-clock time** (`STALE_RUN_THRESHOLD_MS = 1 hour` in `runStatus.ts`) computed from `Date.now()` versus the run's last structured log timestamp. Tests that need to exercise the "stalled" delete-confirmation copy must either seed data with an old timestamp or mock the clock — waiting a real hour is not viable.
- **Demo mode has an autonomous background ticker** (`setInterval(advance, 1500)`) that mutates run/metric state independent of any test action — assertions comparing "before" and "after" snapshots in demo mode can be flaky if they don't account for this drift; prefer asserting specific fields changed for the reason expected, not "nothing else changed."
- **Confirmation modals are used pervasively** for every admin write (deploy, set default, undeploy, delete run, delete version/storage, rename has no modal but has inline Save/Cancel) — a modal `Escape` key handler is global (`document.addEventListener("keydown", ...)` in `Modal`), and clicking the backdrop also closes it; both are legitimate ways to cancel that tests may hit accidentally if click coordinates land outside the card.
- **Admin-gated UI hides intent, not markup.** Write buttons remain present but `disabled` for non-admin users (with `title` tooltips explaining why) rather than being removed — selector-based tests must also check `disabled` state, not just presence, when validating role-based access.
- **Error messages frequently echo raw Postgres/Edge-Function error text** (codes, `details`, `hint` concatenated with `·`) — these are useful for debugging but are **not stable strings to assert on exactly** in Supabase-backed environments (they vary by underlying DB error); prefer asserting on the stable prefixes documented in §5 (e.g. `"Failed to delete run:"`) rather than full string equality when running against a real Supabase backend.
- **`start-training` has a silent fallback path**: if the Edge Function is unreachable/not deployed (404/503 or `hosted_training_not_configured`), the store falls back to inserting a local DB row directly from the browser — from the UI's perspective both paths look identical (a new "waiting" run appears), so a test asserting "training was triggered via the hosted worker" cannot distinguish the two paths from the frontend alone.

---

Files read for this analysis:
- `apps/web/package.json`
- `apps/web/vite.config.ts`
- `apps/web/index.html`
- `apps/web/.env.example`
- `apps/web/src/main.tsx`
- `apps/web/src/App.tsx` (full, 3147 lines)
- `apps/web/src/registry/types.ts`
- `apps/web/src/registry/api.ts`
- `apps/web/src/registry/index.ts`
- `apps/web/src/registry/supabaseStore.ts`
- `apps/web/src/registry/demoStore.ts`
- `apps/web/src/registry/demoStore.test.ts`
- `apps/web/src/registry/runStatus.ts`
- `apps/web/src/registry/deploymentLabels.ts`
- `apps/web/src/registry/exportOptions.ts`
- `apps/web/src/registry/DeploymentSwaggerPanel.tsx`
- `supabase/functions/download-artifact/index.ts`
- `supabase/functions/list-deployed-models/index.ts`

Not fully inspected (not load-bearing for this deliverable): `apps/web/src/registry/metrics.ts`, `openapi.ts` and their `.test.ts` files (internal derivation/spec-generation helpers, not user-facing states); `apps/web/src/styles.css` / `tokens.css` (visual styling only); `supabase/functions/start-training`, `upload-dataset`, `storage-usage`, `resolve-channel`, `training-callback` (only their call shapes/error strings as surfaced to the frontend were needed, captured in §5 via `supabaseStore.ts`'s handling of their responses).
