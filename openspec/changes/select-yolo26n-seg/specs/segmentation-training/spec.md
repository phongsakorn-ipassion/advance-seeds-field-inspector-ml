# Spec — segmentation-training

## MODIFIED Requirements

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
