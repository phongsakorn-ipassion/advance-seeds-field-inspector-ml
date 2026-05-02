## ADDED Requirements

### Requirement: Admins trigger hosted training jobs from the browser
The system SHALL provide a `start-training` Edge Function that accepts an
admin-authenticated request, dispatches a job on a hosted GPU provider,
and links the resulting job id to a new `runs` row.

#### Scenario: Admin starts training from the dashboard
- **WHEN** an authenticated admin posts a config to `start-training`
- **THEN** the function inserts a `runs` row with `status='running'`
- **AND** calls the configured hosted provider with the run id and config
- **AND** stores the returned provider job id on the run row
- **AND** returns the run id and provider job id to the caller

#### Scenario: Non-admin caller is rejected
- **WHEN** a non-admin posts to `start-training`
- **THEN** the function rejects with HTTP 403 and writes nothing

#### Scenario: Provider failure
- **WHEN** the hosted provider rejects the request
- **THEN** the function marks the just-created run as `failed`
- **AND** returns the provider error to the caller

### Requirement: Hosted training writes metrics back through a signed callback
The system SHALL provide a `training-callback` Edge Function that accepts
HMAC-signed events from the worker and writes to `run_metrics`,
`runs.config_yaml.logs`, and `versions`.

#### Scenario: Worker reports a metric
- **WHEN** the worker posts a `metric` event with a valid signature
- **THEN** the function inserts a `run_metrics` row with the run id,
  step, epoch, name, and value

#### Scenario: Worker streams a log batch
- **WHEN** the worker posts a `log` event with a valid signature
- **THEN** the function appends the lines to `runs.config_yaml.logs`,
  trimmed to the last 500 lines

#### Scenario: Worker reports success
- **WHEN** the worker posts a `succeeded` event with R2 keys and final
  metrics
- **THEN** the function inserts a `versions` row linked to the run,
  updates the run's `status` to `succeeded` and `finished_at`, and
  returns 200

#### Scenario: Worker reports failure
- **WHEN** the worker posts a `failed` event
- **THEN** the function updates the run's `status` to `failed`, appends
  the error to logs, and returns 200

#### Scenario: Invalid signature is rejected
- **WHEN** a callback arrives with a missing or invalid HMAC
- **THEN** the function rejects with HTTP 401 and writes nothing

### Requirement: Hosted runs do not leak provider credentials to the browser
The hosted training path SHALL keep all provider API keys and HMAC secrets
on the Supabase Functions runtime; the browser SHALL only ever talk to the
Edge Functions.

#### Scenario: Browser bundle is inspected
- **WHEN** the dashboard's bundled JS is searched for known secret name
  prefixes (`MODAL_`, `REPLICATE_`, `TRAINING_PROVIDER_`,
  `TRAINING_CALLBACK_`)
- **THEN** no occurrences are found

### Requirement: Local SDK path remains supported
The hosted training trigger SHALL be additive — the existing path where
`scripts/train_yolo26n_seg.py` writes to the registry with a service-role
key SHALL continue to work without changes.

#### Scenario: Local SDK runs in parallel
- **WHEN** an operator runs the Python SDK locally against a model line
- **THEN** the SDK can still insert a `runs` row, stream `run_metrics`,
  and produce a `versions` row with the service-role key
- **AND** the dashboard renders the resulting run identically to a
  hosted-triggered run
