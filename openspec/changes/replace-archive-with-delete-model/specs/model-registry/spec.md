## MODIFIED Requirements

### Requirement: Archive deletes all version artifacts
Deleting a model version SHALL remove all stored artifacts for the version,
SHALL delete the `versions` row, and SHALL delete the version's parent training
`run` (and its cascaded `run_metrics`) when no other version still references
that run. Deletion SHALL be blocked while the version is deployed and SHALL
route through the admin-only Edge Function.

#### Scenario: Inactive multi-artifact version is deleted
- **WHEN** an admin deletes a version with TF Lite, Core ML, and PyTorch artifacts
- **THEN** all R2 objects are deleted
- **AND** the version row is deleted
- **AND** the version no longer appears in Model versions

#### Scenario: Parent run is removed when it has no other version
- **WHEN** an admin deletes the only version that references a training run
- **THEN** the run row and its `run_metrics` SHALL be deleted
- **AND** the response SHALL report the deleted run id

#### Scenario: Shared parent run is preserved
- **WHEN** an admin deletes a version whose run is still referenced by another version
- **THEN** the run row SHALL be preserved
- **AND** the surviving version SHALL keep its run reference

#### Scenario: Deployed version delete is blocked
- **WHEN** a version is active in any channel deployment
- **THEN** delete requests fail until it is undeployed
- **AND** no R2 object or database row SHALL be removed
