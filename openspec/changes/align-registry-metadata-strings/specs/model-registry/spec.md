## ADDED Requirements

### Requirement: Registry version metadata uses the export-contract vocabulary
Version metadata written by the registry (via `training-callback`) SHALL use the same `task` and `output_kind` vocabulary as the frozen export contract and the mobile app's metadata validator, and SHALL include `model_name`. Specifically `task` SHALL be `instance-segmentation`, `output_kind` SHALL be `segmentation`, and `model_name` SHALL match `^yolo26[a-z0-9]+-seg$`.

#### Scenario: Callback writes contract-aligned metadata
- **GIVEN** a hosted run completes and posts a `succeeded` callback
- **WHEN** `training-callback` inserts the `versions` row
- **THEN** the stored metadata `task` SHALL be `instance-segmentation`
- **AND** `output_kind` SHALL be `segmentation`
- **AND** `model_name` SHALL be derived from the run's source weights and match `^yolo26[a-z0-9]+-seg$`

#### Scenario: App consumes deployed metadata without overwriting it
- **GIVEN** a version registered with contract-aligned metadata
- **WHEN** the mobile app resolves it via `list-deployed-models`
- **THEN** the wire `task` and `output_kind` SHALL pass `validateModelMetadata` unchanged
- **AND** the app SHALL NOT need to overwrite `task`/`output_kind` to install the model

### Requirement: Changing metadata vocabulary is a deliberate compat cutover
Because `compat_signature` is computed from `class_names + input_size + output_kind + task`, changing the `output_kind`/`task` strings changes the signature of newly registered versions. The change SHALL be rolled out as a deliberate cutover: either existing installed clients are expected to receive `rebuild_required` from `resolve-channel` until they rebuild, or existing versions' signatures are backfilled so old and new clients resolve consistently.

#### Scenario: New deployment after the vocabulary change
- **GIVEN** an installed client whose `current_compat` was computed under the old vocabulary
- **WHEN** it calls `resolve-channel` against a version registered under the new vocabulary
- **THEN** it SHALL receive `rebuild_required` (not a silent `update`) unless a signature backfill has aligned the values
