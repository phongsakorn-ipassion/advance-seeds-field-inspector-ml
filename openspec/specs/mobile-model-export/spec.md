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

### Requirement: Class names derivable from dataset config

The standalone metadata writer and the frozen-contract generator SHALL be able to derive
`class_names` from a dataset config YAML's `names:` block, ordered by class index, instead
of requiring a hand-typed class list. The raw-segmentation `output_shape` SHALL be derived
from the resulting class count (`4 + nc + 32` features).

#### Scenario: Metadata writer derives classes from a dataset config

- **GIVEN** a dataset config whose `names:` is `{0: banana, 1: banana_spot, 2: pepper, 3: watermelon}`
- **WHEN** `scripts/write_model_metadata.py --dataset-config <that yaml>` runs
- **THEN** `class_names` SHALL be `["banana", "banana_spot", "pepper", "watermelon"]` in index order
- **AND** the operator SHALL NOT have to pass `--classes`

#### Scenario: Class list and dataset config are mutually exclusive

- **WHEN** `scripts/write_model_metadata.py` is invoked with both `--classes` and `--dataset-config`, or with neither
- **THEN** it SHALL exit with an error rather than guess a class list

#### Scenario: Names resolve in index order regardless of map order

- **GIVEN** a dataset config whose `names:` dict keys are not in ascending order
- **WHEN** class names are loaded from it
- **THEN** the resulting list SHALL be ordered by class index, index 0 first

### Requirement: Export contract is class-count rule-based, not value-frozen

`configs/model_export_contract.json` SHALL express the class-count-dependent detection
tensor as a rule — layout `[1, 4 + num_classes + 32, anchors]` with `num_classes` sourced
from each model's `model-metadata.json` — rather than a frozen `output_shape` literal, so
the class set can grow release to release without editing the contract. `class_names` in
the contract SHALL be a regenerable snapshot of the current released set (kept in sync from
the dataset YAML), not the source of truth for class count. The `mobile_tflite_filename`
alias, thresholds, calibration contract, and acceptance targets SHALL remain frozen.
Shipping a class set wider than the demo app currently handles SHALL remain gated on a
lockstep demo-app change.

#### Scenario: Contract does not freeze a class-count-dependent shape

- **WHEN** the export contract is inspected
- **THEN** it SHALL NOT contain a class-count-dependent `output_shape` literal
- **AND** it SHALL contain an `output_shape_rule` with layout `[1, 4 + num_classes + 32, anchors]`
- **AND** it SHALL state that `num_classes` comes from `model-metadata.json`, not the contract

#### Scenario: Class snapshot regenerated from a dataset config

- **GIVEN** the v10 dataset config with 10 `names:` (`banana … wax_gourd`)
- **WHEN** `scripts/write_export_contract.py --dataset-config <v10 yaml>` runs
- **THEN** the contract `class_names` snapshot SHALL be the 10 names in index order
- **AND** no `output_shape` literal SHALL be added
- **AND** `mobile_tflite_filename`, `calibration.supported_sources`, and `acceptance_targets` SHALL be unchanged

#### Scenario: Per-model metadata still carries the concrete shape

- **GIVEN** a model trained on N classes
- **WHEN** its `model-metadata.json` is written
- **THEN** its `output_shape` SHALL be the concrete `[1, 4 + N + 32, anchors]` for that model
- **AND** the app SHALL read `num_classes` from that metadata, never from the contract

