# mobile-model-export Specification

## Purpose

Export model artifacts and metadata in a stable contract consumed by the Advance
Seeds Field Inspector demo app.
## Requirements
### Requirement: Stable TFLite app filename
The exported Android/cross-platform model SHALL be copied to the app as
`yolo11n-seeds.tflite` until the consuming app runtime changes its asset path.

#### Scenario: Export copies TFLite artifact
- **GIVEN** `models/yolo11n-seeds.tflite` exists
- **WHEN** `scripts/export_to_demo.py --tflite models/yolo11n-seeds.tflite` runs
- **THEN** the file is copied to the demo app models directory as `yolo11n-seeds.tflite`

### Requirement: App-facing metadata
Every mobile export SHALL include `model-metadata.json` with model name, version,
source weights, mobile TFLite filename, task, input size, active banana-v4
class names, output kind, output shape, thresholds, calibration
contract, and acceptance targets.

#### Scenario: Metadata generation includes calibration contract
- **WHEN** `scripts/write_model_metadata.py` writes metadata
- **THEN** the JSON contains supported calibration sources and default marker size

#### Scenario: Metadata identifies YOLO26n source model
- **WHEN** metadata is generated with default arguments
- **THEN** `source_weights` is `yolo26n-seg.pt`
- **AND** `output_kind` is `segmentation`

#### Scenario: Metadata exports banana-v4 classes
- **WHEN** metadata is generated for the active banana-v4 model
- **THEN** `class_names` are `banana`, `banana_spot`

### Requirement: Export does not assume calibration is optional
Model metadata SHALL state that calibration is required for millimeter
measurements.

#### Scenario: Metadata marks calibration required
- **WHEN** a generated metadata file is inspected
- **THEN** `calibration.required` is `true`

### Requirement: Handoff destination is documented
The repository SHALL document where model artifacts are copied in the consuming
demo app.

#### Scenario: Handoff docs identify destination
- **WHEN** a developer reads `docs/app-handoff.md`
- **THEN** they can identify the app `assets/models` destination for TFLite and metadata files

### Requirement: Candidate model export set
The repository SHALL provide a repeatable script that exports named mobile
candidate models for app QA.

#### Scenario: Banana-v4 candidates are exported
- **WHEN** the mobile candidate export script runs successfully
- **THEN** `runs/mobile-exports/banana-v4/` contains Android, iOS, and PyTorch artifacts
- **AND** `runs/mobile-exports/banana-v4-quantized/` contains Android, iOS, and PyTorch artifacts

### Requirement: Candidate manifests
Each exported candidate SHALL include a manifest that records platform artifact
paths, SHA-256 hashes, byte sizes, the original non-quantized PyTorch `.pt`
artifact, source weights, dataset config, training results, and metadata path.

#### Scenario: Candidate manifest supports app download validation
- **WHEN** a candidate manifest is inspected
- **THEN** it contains a `tflite` artifact entry with `path`, `sha256`, and `size_bytes`
- **AND** it contains a `coreml` artifact entry with `path`, `sha256`, and `size_bytes`
- **AND** it contains a `pytorch` artifact entry with `path`, `sha256`,
  `size_bytes`, and `precision=fp32`
- **AND** the candidate metadata path is recorded

### Requirement: Candidate index
The export workflow SHALL write a root `model-candidates.index.json` that lists
all exported candidate manifests.

#### Scenario: App agents discover local exports
- **WHEN** a developer serves `runs/mobile-exports/`
- **THEN** the consuming app can fetch `model-candidates.index.json`
- **AND** discover each candidate manifest and platform artifact

### Requirement: Dynamic loading handoff
The repository SHALL document how app agents should implement dynamic model
browsing, downloading, validation, activation, fallback, and rollback.

#### Scenario: App handoff covers both platforms
- **WHEN** an app agent reads `docs/dynamic-model-loading-handoff.md`
- **THEN** Android TensorFlow Lite loading requirements are described
- **AND** iOS Core ML package or compiled model loading requirements are described
- **AND** SHA-256 validation and smoke inference are required before activation
