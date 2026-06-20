# python-registry-sdk Specification

## Purpose
Define the Python client (`src/advance_seeds_ml/registry/`) that training scripts
and the hosted worker use to report to the model registry. It loads the registry
endpoint and service-role credentials from environment variables (with Supabase
aliases as fallbacks), creates and finalizes `runs` rows, appends `run_metrics`,
uploads artifacts via `upload-artifact` signed URLs without ever holding R2
credentials directly, and registers `versions` rows with metadata, artifact keys
(including the original PyTorch `.pt`), byte size, and content hash. Registry
reporting is optional and must never change default local-only training behavior.
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
and content hash after model artifacts are uploaded.

#### Scenario: Version registration stores app metadata
- **WHEN** version metadata and artifact details are submitted
- **THEN** the SDK creates a `versions` row whose `metadata`, `semver`,
  `tflite_r2_key`, `size_bytes`, and `content_hash` match the submitted values

#### Scenario: Version registration stores original PyTorch artifact
- **WHEN** an original `.pt` artifact is uploaded through the SDK
- **THEN** the SDK can submit `pytorch_r2_key` on the `versions` row
- **AND** metadata can record `artifacts.pytorch` with `precision=fp32` and no
  quantization

#### Scenario: Registry configuration accepts Supabase aliases
- **WHEN** local repair or Colab scripts provide `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`
- **THEN** the SDK can use those values as fallbacks for the registry endpoint
  and service-role credential
