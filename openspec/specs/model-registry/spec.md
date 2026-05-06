# model-registry Specification

## Purpose
TBD - created by archiving change add-model-registry-backend. Update Purpose after archive.
## Requirements
### Requirement: Channel pointer indirection
Each `(model_line, channel_name)` pair SHALL be a single row whose
`current_version_id` is the source of truth for what mobile clients receive.

#### Scenario: Promotion is a single write
- **WHEN** an admin promotes a version
- **THEN** the matching `channels` row's `current_version_id` is updated
- **AND** a `channel_history` row records the from/to transition

### Requirement: OTA compat signature is server-computed
The `versions.compat_signature` column SHALL be computed by a database
trigger from `metadata.class_names`, `metadata.input_size`,
`metadata.output_kind`, and `metadata.task`, so clients cannot disagree
with the server.

#### Scenario: Trigger derives signature on insert
- **WHEN** a row is inserted into `versions` without `compat_signature`
- **THEN** the trigger sets it to the canonical sha256 hex digest

### Requirement: Mobile-facing channel resolution
The `resolve-channel` Edge Function SHALL return one of three actions:
`update`, `noop`, or `rebuild_required`, based on a comparison between the
client's `current_compat`/`current_version` query parameters and the
channel's current version.

#### Scenario: Compat mismatch blocks OTA
- **GIVEN** the channel's current version has a different `compat_signature` than the client's
- **WHEN** the client calls `resolve-channel`
- **THEN** the response action is `rebuild_required`

### Requirement: Artifact uploads require admin
The `upload-artifact` Edge Function SHALL refuse callers whose JWT lacks
the `admin` role, and SHALL return a one-hour R2 signed PUT URL otherwise.

#### Scenario: Anonymous upload is rejected
- **WHEN** an anonymous client calls `upload-artifact`
- **THEN** the function responds with HTTP 401

### Requirement: Production R2 credentials are rotated before launch
The project SHALL rotate Cloudflare R2 credentials before any production
launch. Credentials used during demo development may remain valid for demo
operation.

#### Scenario: Demo moves to production readiness
- **WHEN** the registry is promoted from demo usage to production usage
- **THEN** the operator rotates the Cloudflare R2 API token
- **AND** updates only gitignored local files, Supabase secrets, or CI secrets
  with the replacement credentials

### Requirement: Versions carry platform artifacts
Each model version SHALL represent one logical segmentation model package with
separate platform artifacts for Android TF Lite, iOS Core ML, and the original
non-quantized PyTorch `.pt` export for local segmentation QA.

#### Scenario: Training registers all required artifacts
- **WHEN** training completes and mobile exports succeed
- **THEN** the version row stores `tflite_r2_key`, `mlmodel_r2_key`, and
  `pytorch_r2_key`
- **AND** metadata records per-platform size and content hash

#### Scenario: Local QA artifact is missing during training export
- **WHEN** the Colab training script cannot find or upload `best.pt` or
  `last.pt`
- **THEN** the run is finalized as failed
- **AND** no successful version is created without `pytorch_r2_key`

#### Scenario: Existing version is missing Local QA artifact
- **WHEN** an older successful version has Android and iOS artifacts but no
  `pytorch_r2_key`
- **THEN** an operator can backfill the original `.pt` weights from the training
  runtime
- **AND** the version row and `metadata.artifacts.pytorch` are patched to match
  the uploaded R2 key

#### Scenario: Production schema accepts local QA artifact keys
- **WHEN** the registry database is deployed
- **THEN** the `versions` table has a nullable `pytorch_r2_key` column

#### Scenario: Training records mobile export optimization
- **WHEN** the Colab training script exports mobile artifacts
- **THEN** the Android TF Lite artifact SHALL use calibrated INT8 export with
  the training dataset YAML as representative calibration data
- **AND** the iOS Core ML artifact SHALL use FP16 optimization by default
- **AND** the PyTorch artifact SHALL preserve the original `.pt` weights without
  quantization
- **AND** version metadata SHALL record the quantization or precision mode for
  each platform artifact

#### Scenario: Core ML export is missing
- **WHEN** a version has no Core ML artifact
- **THEN** the dashboard marks iOS as missing while Android remains deployable

### Requirement: Channels support multiple active deployments
The registry SHALL support multiple active deployed versions per channel while
preserving one default version per channel.

#### Scenario: Admin deploys an additional model to staging
- **WHEN** an admin deploys a version to `staging`
- **THEN** an active `channel_deployments` row is created for that version
- **AND** the channel default may be set to that version

#### Scenario: Admin undeploys one version
- **WHEN** an admin removes a version from a channel deployment set
- **THEN** only that version's deployment row is archived
- **AND** other deployed versions on the channel remain available

### Requirement: Mobile apps list deployed models by platform
The registry SHALL expose a mobile-facing endpoint that lists active deployed
models for a channel and returns platform-specific signed artifact URLs.

#### Scenario: Android requests production models
- **WHEN** the mobile app requests `platform=android` and `channel=production`
- **THEN** the response includes deployed versions with TF Lite signed URLs

#### Scenario: iOS requests a model without Core ML
- **WHEN** the mobile app requests `platform=ios`
- **AND** a deployed version has no Core ML artifact
- **THEN** the response marks that deployment as `artifact_missing`

#### Scenario: Dashboard explains mobile consumption
- **WHEN** a model version is deployed to staging or production
- **THEN** Model detail SHALL show mobile integration endpoints for listing
  deployed models and resolving the default channel model
- **AND** the endpoint display SHALL distinguish Android TF Lite and iOS Core
  ML readiness
- **AND** endpoint copy actions SHALL use icon-only buttons
- **AND** active deployment membership SHALL be shown separately from endpoint
  cards

### Requirement: Archive deletes all version artifacts
Archiving or deleting a model version SHALL remove all stored artifacts for the
version and SHALL be blocked while the version is deployed.

#### Scenario: Inactive multi-artifact version is archived
- **WHEN** an admin archives a version with TF Lite, Core ML, and PyTorch artifacts
- **THEN** all R2 objects are deleted
- **AND** the version metadata row is deleted

#### Scenario: Deployed version archive is blocked
- **WHEN** a version is active in any channel deployment
- **THEN** archive/delete requests fail until it is undeployed
