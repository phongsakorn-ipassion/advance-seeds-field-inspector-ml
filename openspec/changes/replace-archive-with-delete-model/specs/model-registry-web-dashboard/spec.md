## MODIFIED Requirements

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

#### Scenario: Admin deletes a model version from Model detail
- **WHEN** an admin clicks Delete model on an inactive model version in Model detail
- **THEN** the dashboard SHALL ask for confirmation
- **AND** the system SHALL permanently delete associated storage artifacts and
  the version row through the same admin-only Edge Function
- **AND** the system SHALL delete the version's parent training run when no
  other version references it
- **AND** the model version SHALL be removed from Model versions rather than
  retained as an archived history record

#### Scenario: Admin downloads model artifacts from Model detail
- **WHEN** an admin views a model version with Android or iOS
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
