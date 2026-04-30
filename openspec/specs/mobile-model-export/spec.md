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
source weights, mobile TFLite filename, task, input size, class names, output
kind, output shape, thresholds, calibration contract, and acceptance targets.

#### Scenario: Metadata generation includes calibration contract
- **WHEN** `scripts/write_model_metadata.py` writes metadata
- **THEN** the JSON contains supported calibration sources and default marker size

#### Scenario: Metadata identifies YOLO26n source model
- **WHEN** metadata is generated with default arguments
- **THEN** `source_weights` is `yolo26n-seg.pt`
- **AND** `output_kind` is `end2end_nms_free`

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
