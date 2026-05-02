## MODIFIED Requirements

### Requirement: Training workflow captures config and live progress
The dashboard SHALL provide a train-new-model workflow with default classes
and hyperparameters, editable settings, live progress tracking, AND, when
the hosted training trigger is configured, the ability to dispatch a real
training job from the browser.

#### Scenario: Training starts with defaults via hosted trigger
- **WHEN** an admin starts a training job with default settings
- **AND** `TRAINING_PROVIDER_BASE_URL` is configured on the Supabase
  Functions runtime
- **THEN** the dashboard calls the `start-training` Edge Function
- **AND** a running job appears with progress and metric updates streamed
  through Realtime as the worker reports them

#### Scenario: Training starts when no hosted trigger is configured
- **WHEN** an admin starts a training job
- **AND** the hosted trigger is not configured
- **THEN** the dashboard inserts the run row directly (existing path) and
  surfaces the boundary explainer card describing the local-SDK
  responsibility for actually running training
