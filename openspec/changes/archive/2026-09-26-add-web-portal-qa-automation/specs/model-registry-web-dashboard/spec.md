## MODIFIED Requirements

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

#### Scenario: Demo mode has a read-only account
- **WHEN** `VITE_SUPABASE_URL` is empty and the demo read-only credentials
  (`readonly@advance-seeds.demo`) are submitted
- **THEN** the dashboard signs the session in with the admin role unset
- **AND** every admin-gated write control (training-run submit, deploy,
  undeploy, rename, delete) is disabled with an "Admin role required" hint
- **AND** no write action is performed

### Requirement: Training workflow captures config and live progress
The dashboard SHALL provide a train-new-model workflow with default classes and
hyperparameters, editable settings, live progress tracking, and, when the
hosted training trigger is configured, the ability to dispatch a real training
job from the browser.

#### Scenario: Required training inputs are missing
- **WHEN** an admin submits Train new model without a dataset config, dataset
  image bundle, or source weights
- **THEN** the dashboard SHALL block run creation
- **AND** field-level errors SHALL identify the missing inputs

#### Scenario: Training form shows current hyperparameter grouping
- **WHEN** the Train new model form is displayed
- **THEN** epochs and image size SHALL be the only primary hyperparameter
  fields
- **AND** Advanced hyperparameters SHALL contain only patience, LR0, and batch
- **AND** no Colab accelerator selector SHALL be shown

#### Scenario: Training starts with defaults via hosted trigger
- **WHEN** an admin starts a training job with default settings
- **AND** `TRAINING_PROVIDER_BASE_URL` is configured on the Supabase Functions
  runtime
- **THEN** the dashboard calls the `start-training` Edge Function
- **AND** a running job appears with progress and metric updates streamed
  through Realtime as the worker reports them

#### Scenario: Training starts when no hosted trigger is configured
- **WHEN** an admin starts a training job
- **AND** the hosted trigger is not configured
- **THEN** the dashboard inserts the run row directly and surfaces the boundary
  explainer card describing the local-SDK responsibility for actually running
  training

#### Scenario: Colab handoff guards against stale export code
- **WHEN** an operator opens the manual Colab handoff
- **THEN** the checklist explains that the notebook syncs the latest main
  checkout
- **AND** the operator is told to confirm a git SHA appears before export starts
- **AND** artifact review mentions Android TF Lite, iOS Core ML, and Local QA
  `.pt` artifacts

#### Scenario: Dataset YAML classes parse regardless of trailing content
- **GIVEN** a dataset YAML whose `names:` block is followed by a blank line and
  another top-level key (e.g. `metadata:`)
- **WHEN** an admin uploads that YAML as the dataset config
- **THEN** the Classes list SHALL show exactly the class names declared in the
  `names:` block, in index order
- **AND** the parser SHALL NOT reject the block merely because content follows
  it later in the file
