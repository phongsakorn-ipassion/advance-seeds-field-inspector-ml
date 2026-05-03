# model-registry-web-dashboard Specification

## Purpose
TBD - created by archiving change add-activity-notifications. Update Purpose after archive.
## Requirements
### Requirement: Dashboard surfaces registry activity notifications
The dashboard SHALL show recent model registry activity in an in-app
notification center without requiring operators to inspect every screen.

#### Scenario: Activity appears in the notification center
- **WHEN** runs, model versions, deployments, or storage records are present in
  the current registry snapshot
- **THEN** the dashboard SHALL derive recent activity notifications from those
  records
- **AND** the topbar notification center SHALL show the most recent activities

#### Scenario: New activity arrives while viewing the dashboard
- **WHEN** Supabase Realtime refreshes the dashboard with a new activity after
  the initial page load
- **THEN** the dashboard SHALL show a short in-app toast for that activity
- **AND** the notification center SHALL reflect the unread activity count

#### Scenario: Operator reviews unread count
- **WHEN** there are zero or more unread activities
- **THEN** the notification trigger SHALL show the unread count as a visible
  number

#### Scenario: Operator manages read state
- **WHEN** an operator opens the notification center
- **THEN** each notification SHALL show whether it is read or unread
- **AND** clicking a notification record SHALL mark that notification as read
- **AND** clicking Mark all read SHALL mark all current notifications as read
- **AND** read state SHALL persist across browser refreshes for that signed-in
  operator
- **AND** there SHALL NOT be a separate read/unread checkbox or toggle button

### Requirement: Live tracking maps Ultralytics metrics
The dashboard SHALL map metric names emitted by Ultralytics training runs into
the existing live-tracking progress and metric fields.

#### Scenario: Ultralytics metrics are inserted
- **WHEN** `run_metrics` contains `progress`, `metrics/mAP50(B)`, or
  `metrics/mAP50-95(M)` rows for a running run
- **THEN** the Live tracking row SHALL update progress and no longer remain in
  the waiting display state
- **AND** mAP50 and mask metric values SHALL render when available

### Requirement: Dashboard shows registry operating state
The web dashboard SHALL show the current staging and production channel state,
recent training runs, and registered model versions on the first screen.

#### Scenario: Operator opens dashboard
- **WHEN** the dashboard loads
- **THEN** staging and production channel cards are visible
- **AND** recent run status is visible
- **AND** model version rows are visible

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

### Requirement: Dashboard builds as a static GitHub Pages app
The dashboard SHALL build to static assets with Vite and SHALL avoid requiring a
custom Node server at runtime.

#### Scenario: Static build succeeds
- **WHEN** the web app build command runs
- **THEN** `apps/web/dist/` contains static assets suitable for GitHub Pages

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

### Requirement: Model records support CRUD-style operations
The dashboard SHALL allow operators to inspect, create through training, update
deployment state, and delete inactive stored model artifacts.

#### Scenario: Operator inspects model detail
- **WHEN** a model version row is selected
- **THEN** model metrics, training config, classes, artifact size, and channel
  state are shown in detail

### Requirement: Training workflow captures config and live progress
The dashboard SHALL provide a train-new-model workflow with default classes and
hyperparameters, editable settings, and live progress tracking.

#### Scenario: Training starts with defaults
- **WHEN** an admin starts a training job with default settings
- **THEN** a running job appears with progress and metric updates

### Requirement: Deployment controls update channels
The dashboard SHALL provide deploy and undeploy controls for staging and
production channels.

#### Scenario: Version is deployed
- **WHEN** an admin deploys a candidate to production
- **THEN** the production channel points to that version

#### Scenario: Version is undeployed
- **WHEN** an admin undeploys a channel
- **THEN** the channel becomes unset

### Requirement: Storage quota is visible
The dashboard SHALL show total model artifact storage usage and warn when usage
is near or over the configured R2 quota.

#### Scenario: Storage exceeds quota
- **WHEN** stored model artifacts exceed the configured quota
- **THEN** the dashboard warns the operator and offers deletion for inactive
  artifacts

### Requirement: Model operations present mobile-ready lifecycle context
The dashboard SHALL present model lifecycle details in operator-facing layouts
that are concise, platform-aware, and useful to mobile app developers consuming
the registry service.

#### Scenario: Model operations has no live runs
- **WHEN** no training runs are currently live
- **THEN** the Live runs panel shows a designed empty state that explains Python
  SDK reporting and links operator intent to the Train pipeline detail view

#### Scenario: Operator reviews model performance artifacts
- **WHEN** a model version has platform artifacts
- **THEN** the Performance section shows mAP50, mask mAP, and artifact cards
  with balanced proportions
- **AND** the artifact card summarizes Android and iOS package sizes without
  exposing sha256 details in the card body

#### Scenario: Version is selectable but not default
- **WHEN** a deployed version is selectable on a channel but is not the default
  resolved model
- **THEN** the Deployment section shows a compact status label instead of a
  plain empty-description paragraph

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

#### Scenario: Completed run hides Colab hand-off
- **WHEN** a run detail has status `succeeded` or `failed`
- **THEN** the dashboard SHALL hide the Open in Colab action
- **AND** the dashboard SHALL hide the Manual Colab hand-off checklist

#### Scenario: Active run exposes copyable Colab run id
- **WHEN** a run is still active or waiting for Colab
- **THEN** the Manual Colab hand-off section SHALL show a concise checklist
- **AND** the run id SHALL have a copy icon action

#### Scenario: Active run Colab checklist is scannable
- **WHEN** a run is still active or waiting for Colab
- **THEN** each Manual Colab hand-off step SHALL render as collapsed content
- **AND** step numbering SHALL remain visually aligned with the step summary
  text and expanded body content

#### Scenario: Succeeded recent run opens trained model
- **WHEN** a recent training run has status `succeeded`
- **AND** the registry has a model version linked to that run
- **THEN** the Recent training runs row SHALL show a shortcut control to the
  trained model
- **AND** selecting the shortcut SHALL open the Models workflow with that
  version selected

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

#### Scenario: Deleted storage record removes model metadata
- **WHEN** an admin deletes an inactive storage record from the Storage screen
- **THEN** the backing model version SHALL be removed from the dashboard's
  model list as well as from storage usage
- **AND** stale channel history references SHALL NOT prevent deletion of an
  inactive version

#### Scenario: Storage deletion requires confirmation
- **WHEN** an admin clicks Delete model on an inactive storage record
- **THEN** the dashboard SHALL show a confirmation dialog before deleting the
  model version and its stored artifacts

#### Scenario: Admin archives an inactive model version
- **WHEN** an admin archives an inactive model version from Model detail
- **THEN** the dashboard SHALL ask for confirmation
- **AND** the system SHALL permanently delete associated storage artifacts
  through the same admin-only Edge Function
- **AND** the model version metadata SHALL remain visible as an archived
  history record in Model detail
- **AND** the model version SHALL no longer be available for future deployment

#### Scenario: Admin downloads model artifacts from Model detail
- **WHEN** an admin views an unarchived model version with Android or iOS
  artifact keys
- **THEN** the Platform readiness section SHALL expose per-platform download
  icon actions
- **AND** artifact downloads SHALL use an admin-only Edge Function that returns
  a short-lived signed R2 URL without exposing R2 credentials to the browser

#### Scenario: Model detail explains dataset image splits
- **WHEN** a model version has dataset image stats from the trainer
- **THEN** the Dataset images section SHALL show total images plus train,
  validation, and test split cards with clear proportions and paths
- **AND** missing counts SHALL render as a waiting state rather than a broken
  or misleading value

#### Scenario: Non-admin tries to delete
- **WHEN** a non-admin caller posts to the deletion endpoint
- **THEN** the function rejects the request with HTTP 403 and does not touch
  R2 or the database

### Requirement: Channel deployment writes audit user ids
The dashboard SHALL write Supabase Auth user ids, not email addresses, into
channel audit columns so deployment and undeployment updates satisfy the live
registry schema.

#### Scenario: Admin deploys to staging or production
- **WHEN** an admin deploys a model version to `staging` or `production`
- **THEN** the channel update SHALL set `updated_by` to the authenticated
  user's UUID
- **AND** deployment failures SHALL be surfaced in the confirmation dialog as
  human-readable error text

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

