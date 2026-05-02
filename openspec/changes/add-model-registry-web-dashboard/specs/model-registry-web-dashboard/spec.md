## ADDED Requirements

### Requirement: Dashboard shows registry operating state
The web dashboard SHALL show the current staging and production channel state,
recent training runs, and registered model versions on the first screen.

#### Scenario: Operator opens dashboard
- **WHEN** the dashboard loads
- **THEN** staging and production channel cards are visible
- **AND** recent run status is visible
- **AND** model version rows are visible

### Requirement: Dashboard separates sample data from UI components
The web dashboard SHALL keep registry data access in a dedicated module so
sample data can be replaced with Supabase queries without rewriting the view
components.

#### Scenario: Data source is replaced later
- **WHEN** Supabase integration is added
- **THEN** existing dashboard components receive the same run, version, and
  channel-shaped data from the data module

### Requirement: Dashboard builds as a static GitHub Pages app
The dashboard SHALL build to static assets with Vite and SHALL avoid requiring a
custom Node server at runtime.

#### Scenario: Static build succeeds
- **WHEN** the web app build command runs
- **THEN** `apps/web/dist/` contains static assets suitable for GitHub Pages

### Requirement: Admin login gates registry operations
The dashboard SHALL require an admin login before model registry management
screens are visible.

#### Scenario: Admin logs in
- **WHEN** a demo admin enters valid credentials
- **THEN** the dashboard shows the operator workflow

#### Scenario: Invalid login is rejected
- **WHEN** invalid credentials are submitted
- **THEN** the dashboard keeps registry operations hidden

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
