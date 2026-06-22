## MODIFIED Requirements

### Requirement: App-facing metadata
Every mobile export SHALL include `model-metadata.json` with model name, version,
source weights, mobile TFLite filename, task, input size, the **class names the
model was actually trained on** (derived from the trained model, ordered by
class index), output kind, output shape, thresholds, calibration contract, and
acceptance targets.

#### Scenario: Metadata generation includes calibration contract
- **WHEN** `scripts/write_model_metadata.py` writes metadata
- **THEN** the JSON contains supported calibration sources and default marker size

#### Scenario: Metadata identifies YOLO26n source model
- **WHEN** metadata is generated with default arguments
- **THEN** `source_weights` is `yolo26n-seg.pt`
- **AND** `output_kind` is `segmentation`

#### Scenario: Metadata class names reflect the trained model
- **GIVEN** a trained model whose `model.names` is `{0: banana, 1: banana_spot, 2: pepper, 3: watermelon}`
- **WHEN** `scripts/export_mobile_model_candidates.py` writes the candidate metadata
- **THEN** `class_names` SHALL be `["banana", "banana_spot", "pepper", "watermelon"]` in class-index order
- **AND** `class_names` SHALL NOT be a hardcoded banana-only list

#### Scenario: Class names are resolved in index order regardless of map order
- **GIVEN** a model whose `model.names` dict keys are not in ascending order
- **WHEN** export resolves the class names
- **THEN** the resulting list SHALL be ordered by class index, index 0 first

#### Scenario: Export never emits an empty class list
- **GIVEN** a model that exposes no class names
- **WHEN** export resolves the class names with no usable fallback
- **THEN** export SHALL raise rather than write metadata with empty `class_names`
