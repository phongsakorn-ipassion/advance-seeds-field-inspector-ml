# Spec — mobile-model-export

## MODIFIED Requirements

### Requirement: App-facing metadata
Every mobile export SHALL include `model-metadata.json` with model name, version,
source weights, mobile TFLite filename, task, input size, canonical PoC
object/spot class names, output kind, output shape, thresholds, calibration
contract, and acceptance targets.

#### Scenario: Metadata generation includes calibration contract
- **WHEN** `scripts/write_model_metadata.py` writes metadata
- **THEN** the JSON contains supported calibration sources and default marker size

#### Scenario: Metadata identifies YOLO26n source model
- **WHEN** metadata is generated with default arguments
- **THEN** `source_weights` is `yolo26n-seg.pt`
- **AND** `output_kind` is `end2end_nms_free`

#### Scenario: Metadata exports PoC classes
- **WHEN** metadata is generated for the PoC model
- **THEN** `class_names` are `apple`, `apple_spot`, `banana`, `banana_spot`, `orange`, `orange_spot`
