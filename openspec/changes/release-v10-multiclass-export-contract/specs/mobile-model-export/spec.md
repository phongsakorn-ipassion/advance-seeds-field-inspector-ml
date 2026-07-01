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
