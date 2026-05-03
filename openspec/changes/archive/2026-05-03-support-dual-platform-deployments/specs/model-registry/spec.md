## ADDED Requirements

### Requirement: Versions carry platform artifacts
Each model version SHALL represent one logical segmentation model package with
separate platform artifacts for Android TF Lite and iOS Core ML.

#### Scenario: Training registers both artifacts
- **WHEN** training completes and both exports succeed
- **THEN** the version row stores `tflite_r2_key` and `mlmodel_r2_key`
- **AND** metadata records per-platform size and content hash

#### Scenario: Training records mobile export optimization
- **WHEN** the Colab training script exports mobile artifacts
- **THEN** the Android TF Lite artifact SHALL use calibrated INT8 export with
  the training dataset YAML as representative calibration data
- **AND** the iOS Core ML artifact SHALL use FP16 optimization by default
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

### Requirement: Archive deletes both platform artifacts
Archiving or deleting a model version SHALL remove all stored artifacts for the
version and SHALL be blocked while the version is deployed.

#### Scenario: Inactive dual-artifact version is archived
- **WHEN** an admin archives a version with TF Lite and Core ML artifacts
- **THEN** both R2 objects are deleted
- **AND** the version metadata row is deleted

#### Scenario: Deployed version archive is blocked
- **WHEN** a version is active in any channel deployment
- **THEN** archive/delete requests fail until it is undeployed
