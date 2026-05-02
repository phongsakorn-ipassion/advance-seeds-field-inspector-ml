## MODIFIED Requirements

### Requirement: Dashboard separates sample data from UI components
The dashboard SHALL keep registry data access behind a single store interface
so the UI can switch between a sample/demo data source and a live Supabase
data source without rewriting view components.

#### Scenario: Live mode is selected
- **WHEN** `VITE_SUPABASE_URL` is configured at build or run time
- **THEN** dashboard reads come from Supabase and writes go through the
  Supabase client under the user's session

#### Scenario: Demo mode is selected
- **WHEN** `VITE_SUPABASE_URL` is empty
- **THEN** the dashboard uses the in-memory demo store and remains usable
  without a Supabase project

### Requirement: Admin login gates registry operations
The dashboard SHALL authenticate operators through Supabase Auth in live mode
and SHALL only render write controls when the active session carries
`app_metadata.role = "admin"`.

#### Scenario: Admin signs in through Supabase
- **WHEN** an operator signs in with valid Supabase credentials
- **AND** their JWT carries `app_metadata.role = "admin"`
- **THEN** the dashboard shows the operator workflow with deploy, undeploy,
  start-training, and delete-artifact controls enabled

#### Scenario: Non-admin session is read-only
- **WHEN** a signed-in user does not have the admin role
- **THEN** read screens render normally and write controls are disabled with
  an explanatory hint

#### Scenario: Demo login still works without Supabase
- **WHEN** `VITE_SUPABASE_URL` is empty and the demo admin credentials are
  submitted
- **THEN** the dashboard shows the operator workflow against the demo store

## ADDED Requirements

### Requirement: Live training progress reflects registry writes
The dashboard SHALL subscribe to Realtime updates on `runs` and `run_metrics`
so that progress, metrics, and final status update without a manual refresh
once the Python SDK reports them.

#### Scenario: SDK records a metric while a run is in progress
- **WHEN** the SDK inserts a row into `run_metrics` for a running run
- **THEN** the dashboard's live tracking panel updates to reflect the new
  metric within a few seconds

#### Scenario: Run finishes
- **WHEN** the SDK marks a run as `succeeded`
- **THEN** the dashboard moves it from running into the history list and
  surfaces the resulting candidate version

### Requirement: Channel writes update Supabase
The dashboard SHALL write deploy and undeploy actions to the `channels` table
so the registry trigger records an entry in `channel_history`.

#### Scenario: Admin deploys a candidate to production
- **WHEN** an admin clicks deploy on a candidate version
- **THEN** the dashboard updates the corresponding `channels` row with the
  new `current_version_id` and `updated_by`
- **AND** a new row appears in `channel_history` with the previous and new
  version ids

#### Scenario: Admin undeploys a channel
- **WHEN** an admin undeploys a channel
- **THEN** the dashboard sets the channel's `current_version_id` to null

### Requirement: Storage usage and deletion route through an Edge Function
The dashboard SHALL fetch R2 storage usage and request inactive artifact
deletion through an admin-only Edge Function so that no R2 credentials enter
the browser bundle.

#### Scenario: Dashboard reads storage usage
- **WHEN** the storage screen mounts
- **THEN** the dashboard calls the storage-usage Edge Function and renders
  the returned `used_bytes` and `quota_bytes`

#### Scenario: Admin deletes an inactive artifact
- **WHEN** an admin requests deletion of an inactive version's artifact
- **THEN** the Edge Function verifies the caller's admin role, removes the
  R2 objects, deletes the version row, and returns the new usage total

#### Scenario: Non-admin tries to delete
- **WHEN** a non-admin caller posts to the deletion endpoint
- **THEN** the function rejects the request with HTTP 403 and does not touch
  R2 or the database

### Requirement: Dashboard follows the Advance Seeds design system
The dashboard SHALL adopt the Advance Seeds design DNA used by the field
inspector demo so the two products feel like one product family.

#### Scenario: Tokens drive every visual value
- **WHEN** the dashboard renders any color, spacing, radius, font, or motion
  duration
- **THEN** the value resolves through a CSS variable defined in the vendored
  `tokens.css` (mirroring `packages/tokens` from the demo repo)
- **AND** no hard-coded hex colors, brand values, or spacing literals appear
  outside `tokens.css`

#### Scenario: Brand identity matches the demo
- **WHEN** the dashboard renders the brand mark and primary affordances
- **THEN** the brand color is the demo's deep teal (`--as-brand`)
- **AND** the brand mark is a `Sprout` icon, not a custom block letter

#### Scenario: Layout matches the demo's topbar shell
- **WHEN** an authenticated operator views any page
- **THEN** navigation lives in a sticky topbar (Overview / Train / Models /
  Storage), not a sidebar
- **AND** the workspace is centered with a max width consistent with the
  demo dashboard

#### Scenario: Light mode only
- **WHEN** the dashboard renders
- **THEN** only the light token set is active; no dark theme toggle is
  exposed and the operating system's `prefers-color-scheme` is ignored

### Requirement: Dashboard publishes to GitHub Pages from CI
The repository SHALL include a GitHub Actions workflow that builds
`apps/web` and publishes `apps/web/dist` to GitHub Pages on pushes to the
default branch.

#### Scenario: Push to main triggers Pages deploy
- **WHEN** a commit lands on `main` that touches `apps/web/`
- **THEN** the workflow builds the dashboard and publishes the static
  artifact to GitHub Pages
