## ADDED Requirements

### Requirement: Train form requires runnable inputs
The dashboard SHALL block creation of a training run until the operator has provided a dataset config, dataset image bundle, and source weights.

#### Scenario: Required inputs are missing
- **WHEN** an admin submits Train new model without a dataset config, dataset image bundle, or source weights
- **THEN** no run SHALL be created
- **AND** field-level errors SHALL identify the missing inputs

#### Scenario: Required inputs are present
- **WHEN** an admin provides a dataset config, dataset image bundle, source weights, and valid hyperparameters
- **THEN** the dashboard SHALL create the run using those inputs

### Requirement: Train form omits dashboard accelerator selection
The dashboard SHALL NOT ask operators to select a Colab accelerator when creating a run.

#### Scenario: Operator creates a run
- **WHEN** the Train new model form is displayed
- **THEN** epochs and image size SHALL be visible in the primary hyperparameter section
- **AND** Advanced hyperparameters SHALL contain only patience, LR0, and batch
- **AND** no Colab accelerator selector SHALL be shown

### Requirement: Run detail visualizes live training metrics
Run detail SHALL show live numeric and charted training metrics from `run_metrics`.

#### Scenario: Metric rows arrive
- **WHEN** `run_metrics` contains Ultralytics mAP50, mAP50-95, precision, recall, or mask metric rows for a run
- **THEN** Run detail SHALL show the latest values as numbers
- **AND** SHALL render a compact metric chart over epoch or step

### Requirement: Model detail shows final metric summary
Model detail SHALL show the final normalized training metrics stored in version metadata.

#### Scenario: Version has normalized metrics
- **WHEN** a model version metadata object contains normalized metric fields
- **THEN** Model detail SHALL show mAP50, mAP50-95, precision, recall, and mask metric values when available

#### Scenario: Version uses linked run metrics as fallback
- **WHEN** a model version is linked to a training run that has normalized `run_metrics` rows
- **AND** version metadata is missing mAP50-95, precision, recall, Mask mAP50, or another normalized metric
- **THEN** Model detail SHALL use the linked run metric summary for the missing values
- **AND** version metadata values SHALL take precedence over run fallback values

#### Scenario: Historical version lacks a metric
- **WHEN** a historical model version does not contain one of the normalized metrics
- **THEN** Model detail SHALL render that metric as unavailable rather than `0%`
