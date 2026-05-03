# python-registry-sdk Specification

## Purpose
TBD - created by archiving change add-python-registry-sdk. Update Purpose after archive.
## Requirements
### Requirement: Registry configuration is environment driven
The SDK SHALL load registry endpoint and service-role credentials from
environment variables and SHALL report a clear configuration error when required
values are missing.

#### Scenario: Missing registry settings fail clearly
- **WHEN** registry reporting is requested without required environment variables
- **THEN** the SDK raises a configuration error naming the missing setting

### Requirement: Training runs can be registered
The SDK SHALL create run records, append metric rows, and finalize run status
using the Supabase backend contract.

#### Scenario: Run lifecycle is sent to backend
- **WHEN** a training script starts, logs metrics, and finishes successfully
- **THEN** the SDK sends requests to create a `runs` row, insert `run_metrics`
  rows, and update the run status to `succeeded`

### Requirement: Artifacts upload through signed URLs
The SDK SHALL request an upload URL from `upload-artifact` and SHALL upload
artifact bytes to the returned signed URL without using R2 credentials directly.

#### Scenario: Artifact upload uses backend signing
- **WHEN** a TFLite artifact is uploaded through the SDK
- **THEN** the SDK calls `upload-artifact`, uploads the bytes to the returned
  URL, and returns the backend `r2_key`

### Requirement: Model versions can be registered
The SDK SHALL create version records with metadata, artifact keys, byte size,
and content hash after a model artifact is uploaded.

#### Scenario: Version registration stores app metadata
- **WHEN** version metadata and artifact details are submitted
- **THEN** the SDK creates a `versions` row whose `metadata`, `semver`,
  `tflite_r2_key`, `size_bytes`, and `content_hash` match the submitted values

