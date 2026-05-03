# model-registry Specification — Backend Delta

## ADDED Requirements

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
