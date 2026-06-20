# segmentation-training Specification

## Purpose

Train and evaluate an instance segmentation model that produces per-object masks
for downstream measurement and grading.
## Requirements
### Requirement: Segmentation model training path
The project SHALL support training Ultralytics YOLO26 segmentation models from validated YOLO
segmentation datasets for the canonical PoC object/spot class list.

#### Scenario: Training uses validated dataset config
- **GIVEN** a dataset config has passed `scripts/validate_dataset.py`
- **WHEN** a training run starts
- **THEN** the run uses that config as its dataset source

#### Scenario: Training starts from YOLO26n segmentation weights
- **GIVEN** the model source has not been overridden by a documented OpenSpec change
- **WHEN** training is configured
- **THEN** the source weights are `yolo26n-seg.pt`

#### Scenario: Dashboard offers YOLO26 segmentation size variants
- **WHEN** an operator selects source weights in the Train new model form
- **THEN** the selector includes `yolo26n-seg.pt`, `yolo26s-seg.pt`,
  `yolo26m-seg.pt`, `yolo26l-seg.pt`, and `yolo26x-seg.pt`

#### Scenario: PoC training uses object and spot classes
- **WHEN** PoC training is configured
- **THEN** the class list is `banana`, `banana_spot`

### Requirement: Segmentation metrics are reported
Training validation SHALL report box mAP and mask mAP separately.

#### Scenario: Validation report includes mask metric
- **WHEN** a validation run completes
- **THEN** the report includes at least segmentation mAP and mask mAP values

### Requirement: Acceptance targets are explicit
The documented acceptance targets SHALL be segmentation mAP >= 0.85 and mask
mAP >= 0.80 on the agreed gold-standard validation or holdout set. These targets
are a **manual review reference**, not an automated gate: `scripts/evaluate_model_summary.py`
emits free-text `acceptance_notes` for an operator to weigh before promotion; it
does not itself evaluate the thresholds or set a release-ready flag.

#### Scenario: Model below target is reviewed against documented acceptance targets
- **GIVEN** a trained model has mask mAP below 0.80
- **WHEN** an operator reviews the evaluation summary's `acceptance_notes`
- **THEN** the operator compares the metrics against the documented acceptance
  targets and decides not to promote the model for the mobile app

### Requirement: Training outputs remain out of Git
Heavy training outputs such as run directories and model weights SHALL remain
ignored by Git unless explicitly promoted as a lightweight metadata artifact.

#### Scenario: Weight file is ignored
- **GIVEN** a training run writes `models/candidate.tflite`
- **WHEN** `git status --short` runs
- **THEN** the heavy model file is ignored by default

### Requirement: Banana v4 training entrypoint
The project SHALL provide a repeatable YOLO26n-seg training entrypoint for the
processed banana-v4 dataset.

#### Scenario: Dry-run prints resolved training config
- **WHEN** `python3 scripts/train_yolo26n_seg.py --dry-run` runs
- **THEN** the command prints the resolved training configuration
- **AND** the equivalent command starts with `yolo segment train`

#### Scenario: Smoke run can override epochs and name
- **WHEN** `python3 scripts/train_yolo26n_seg.py --dry-run --epochs 3 --name banana-v4-smoke` runs
- **THEN** the resolved config has `epochs` equal to `3`
- **AND** `name` equal to `banana-v4-smoke`

#### Scenario: Training paths are anchored to the repository
- **WHEN** the training entrypoint resolves a repo-relative dataset config or
run project path
- **THEN** it materializes an ignored runtime dataset config with an absolute
dataset root
- **AND** it passes absolute dataset config and run project paths to Ultralytics
- **AND** global Ultralytics settings cannot redirect the dataset or run output
outside the repository

### Requirement: Banana PoC hyperparameters are documented
The project SHALL document the default banana-v4 training hyperparameters and
the rationale for using them.

#### Scenario: Hyperparameter documentation exists
- **WHEN** a developer opens `docs/training-hyperparameters.md`
- **THEN** they can see the default epochs, patience, image size, learning rate,
augmentation settings, and smoke/full-run commands

### Requirement: Banana v4 local training default
The local banana training launcher SHALL train from the banana-v4 config by
default.

#### Scenario: Local launcher uses banana-v4 config
- **WHEN** `scripts/train_local_banana.sh --dry-run` runs
- **THEN** it validates `configs/dataset.v4.yaml`
- **AND** it passes `configs/train.banana-v4.yaml` to the training entrypoint

### Requirement: Training may report to registry
YOLO26n segmentation training SHALL support optional model registry reporting
without changing the default local-only training behavior.

#### Scenario: Registry disabled preserves local training
- **WHEN** `scripts/train_yolo26n_seg.py --dry-run` runs without registry flags
- **THEN** no registry client is created and no backend request is attempted

#### Scenario: Registry enabled creates lifecycle records
- **WHEN** registry reporting is enabled for a non-dry training run
- **THEN** the script creates a registry run before training and finalizes it
  after training completes or fails

### Requirement: Training finalizes normalized metrics
Training scripts SHALL produce a normalized final metric summary for registry
model versions.

#### Scenario: Manual Colab run succeeds
- **WHEN** `scripts/train_for_run.py` completes training and exports model
  artifacts
- **THEN** the version metadata SHALL contain normalized final metrics for
  mAP50, mAP50-95, precision, recall, and mask equivalents when emitted by
  Ultralytics
- **AND** raw YOLO metric names SHALL be preserved for audit/debug

#### Scenario: Metric is unavailable
- **WHEN** Ultralytics does not emit a specific metric
- **THEN** the normalized metric summary SHALL omit that field rather than
  storing a false zero

### Requirement: Colab training consumes dataset bundles
The Colab training flow SHALL automatically download and extract an attached dataset image bundle before starting Ultralytics training.

#### Scenario: Run has dataset bundle
- **WHEN** `runs.config_yaml.dataset_bundle` is a dataset R2 key
- **THEN** the trainer SHALL request a signed download URL through `download-dataset`
- **AND** unzip the bundle into a location compatible with the dataset YAML split paths
- **AND** scan/report dataset image counts before training begins

#### Scenario: Run has no dataset bundle
- **WHEN** no dataset bundle key exists on the run
- **THEN** the notebook SHALL continue to present the manual Drive unzip fallback

#### Scenario: Training reaches terminal status with uploaded bundle
- **WHEN** a run with `runs.config_yaml.dataset_bundle` reaches `succeeded` or
  `failed`
- **THEN** the trainer SHALL delete the temporary dataset ZIP from R2 through a
  service-role Edge Function
- **AND** the run config SHALL record the deleted bundle key and deletion time
  so operators can audit the cleanup
