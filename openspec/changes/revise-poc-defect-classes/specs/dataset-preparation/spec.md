# Spec — dataset-preparation

## MODIFIED Requirements

### Requirement: YOLO segmentation dataset config
The repository SHALL provide a YOLO segmentation dataset config that defines a
dataset root, train/val/test image folders, and the canonical PoC object/spot
class names.

#### Scenario: Dataset config loads
- **GIVEN** `configs/dataset.example.yaml`
- **WHEN** `python3 scripts/validate_dataset.py configs/dataset.example.yaml` runs
- **THEN** the config loads and reports split counts and class names

#### Scenario: PoC class order is stable
- **WHEN** the dataset config is loaded
- **THEN** class id `0` is `apple`
- **AND** class id `1` is `apple_spot`
- **AND** class id `2` is `banana`
- **AND** class id `3` is `banana_spot`
- **AND** class id `4` is `orange`
- **AND** class id `5` is `orange_spot`
