# segmentation-training Specification

## Purpose

Train and evaluate an instance segmentation model that produces per-seed masks
for downstream measurement and grading.

## Requirements

### Requirement: Segmentation model training path
The project SHALL support training Ultralytics YOLO26n-seg from validated YOLO
segmentation datasets.

#### Scenario: Training uses validated dataset config
- **GIVEN** a dataset config has passed `scripts/validate_dataset.py`
- **WHEN** a training run starts
- **THEN** the run uses that config as its dataset source

#### Scenario: Training starts from YOLO26n segmentation weights
- **GIVEN** the model source has not been overridden by a documented OpenSpec change
- **WHEN** training is configured
- **THEN** the source weights are `yolo26n-seg.pt`

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
