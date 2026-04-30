# Spec — segmentation-training

## ADDED Requirements

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
