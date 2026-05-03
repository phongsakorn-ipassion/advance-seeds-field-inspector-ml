# segmentation-training Specification

## Purpose

Train and evaluate an instance segmentation model that produces per-object masks
for downstream measurement and grading.
## Requirements
### Requirement: Segmentation model training path
The project SHALL support training Ultralytics YOLO26n-seg from validated YOLO
segmentation datasets for the canonical PoC object/spot class list.

#### Scenario: Training uses validated dataset config
- **GIVEN** a dataset config has passed `scripts/validate_dataset.py`
- **WHEN** a training run starts
- **THEN** the run uses that config as its dataset source

#### Scenario: Training starts from YOLO26n segmentation weights
- **GIVEN** the model source has not been overridden by a documented OpenSpec change
- **WHEN** training is configured
- **THEN** the source weights are `yolo26n-seg.pt`

#### Scenario: PoC training uses object and spot classes
- **WHEN** PoC training is configured
- **THEN** the class list is `apple`, `apple_spot`, `banana`, `banana_spot`, `orange`, `orange_spot`

### Requirement: Segmentation metrics are reported
Training validation SHALL report box mAP and mask mAP separately.

#### Scenario: Validation report includes mask metric
- **WHEN** a validation run completes
- **THEN** the report includes at least segmentation mAP and mask mAP values

### Requirement: Acceptance targets are explicit
The target acceptance metrics SHALL be segmentation mAP >= 0.85 and mask mAP >=
0.80 on the agreed gold-standard validation or holdout set.

#### Scenario: Model below target is not release-ready
- **GIVEN** a trained model has mask mAP below 0.80
- **WHEN** export readiness is reviewed
- **THEN** the model is marked not release-ready for the mobile app

### Requirement: Training outputs remain out of Git
Heavy training outputs such as run directories and model weights SHALL remain
ignored by Git unless explicitly promoted as a lightweight metadata artifact.

#### Scenario: Weight file is ignored
- **GIVEN** a training run writes `models/candidate.tflite`
- **WHEN** `git status --short` runs
- **THEN** the heavy model file is ignored by default

### Requirement: Banana PoC training entrypoint
The project SHALL provide a repeatable YOLO26n-seg training entrypoint for the
processed banana-v1 dataset.

#### Scenario: Dry-run prints resolved training config
- **WHEN** `python3 scripts/train_yolo26n_seg.py --dry-run` runs
- **THEN** the command prints the resolved training configuration
- **AND** the equivalent command starts with `yolo segment train`

#### Scenario: Smoke run can override epochs and name
- **WHEN** `python3 scripts/train_yolo26n_seg.py --dry-run --epochs 3 --name banana-v1-smoke` runs
- **THEN** the resolved config has `epochs` equal to `3`
- **AND** `name` equal to `banana-v1-smoke`

#### Scenario: Training paths are anchored to the repository
- **WHEN** the training entrypoint resolves a repo-relative dataset config or
run project path
- **THEN** it materializes an ignored runtime dataset config with an absolute
dataset root
- **AND** it passes absolute dataset config and run project paths to Ultralytics
- **AND** global Ultralytics settings cannot redirect the dataset or run output
outside the repository

### Requirement: Banana PoC hyperparameters are documented
The project SHALL document the default banana-v1 training hyperparameters and
the rationale for using them.

#### Scenario: Hyperparameter documentation exists
- **WHEN** a developer opens `docs/training-hyperparameters.md`
- **THEN** they can see the default epochs, patience, image size, learning rate,
augmentation settings, and smoke/full-run commands

### Requirement: Banana v2 local training default
The local banana training launcher SHALL train from the banana-v2 config by
default.

#### Scenario: Local launcher uses banana-v2 config
- **WHEN** `scripts/train_local_banana.sh --dry-run` runs
- **THEN** it validates `configs/dataset.banana-v2.yaml`
- **AND** it passes `configs/train.banana-v2.yaml` to the training entrypoint

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

