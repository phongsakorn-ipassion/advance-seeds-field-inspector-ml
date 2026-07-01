## ADDED Requirements

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

### Requirement: Frozen export contract reflects the released class set

`configs/model_export_contract.json` SHALL be regenerable from a dataset config YAML so its
`class_names` and raw-segmentation `output_shape` reflect the class set being released,
while preserving the frozen `mobile_tflite_filename` alias, thresholds, calibration
contract, and acceptance targets. Shipping a class set wider than the demo app currently
handles SHALL remain gated on a lockstep demo-app change.

#### Scenario: Contract regenerated for the v10 class set

- **GIVEN** the v10 dataset config with 10 `names:` (`banana … wax_gourd`)
- **WHEN** `scripts/write_export_contract.py --dataset-config <v10 yaml>` runs
- **THEN** the emitted contract `class_names` SHALL be the 10 names in index order
- **AND** `output_shape` SHALL be `[1, 46, 8400]` (`4 + 10 + 32` features over 8400 anchors)
- **AND** `mobile_tflite_filename` SHALL remain `yolo11n-seeds.tflite`
- **AND** `calibration.supported_sources` and `acceptance_targets` SHALL be unchanged
