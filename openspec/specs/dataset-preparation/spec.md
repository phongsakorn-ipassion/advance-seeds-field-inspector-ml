# dataset-preparation Specification

## Purpose

Ensure labeled client images are valid, split safely, and ready for YOLO
segmentation training without data leakage.

## Requirements

### Requirement: YOLO segmentation dataset config
The repository SHALL provide a YOLO segmentation dataset config that defines a
dataset root, train/val/test image folders, and class names.

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

### Requirement: Segmentation label validation
Dataset validation SHALL reject malformed YOLO segmentation label rows, including
undefined class ids, fewer than three polygon points, odd coordinate counts,
non-numeric coordinates, and coordinates outside `[0, 1]`.

#### Scenario: Bad polygon coordinate fails validation
- **GIVEN** a label row with coordinate `1.20`
- **WHEN** dataset validation reads the label file
- **THEN** validation reports the coordinate as outside the normalized range

### Requirement: Dataset storage remains local
Raw, interim, and processed client datasets SHALL remain outside Git by default.

#### Scenario: Local dataset path is ignored
- **GIVEN** a developer places images under `data/raw/`
- **WHEN** they run `git status --short`
- **THEN** the image files are not staged unless the ignore policy is explicitly changed

### Requirement: Split by image
Train, validation, and test splits SHALL be managed by image, not by seed
instance, to avoid leakage between splits.

#### Scenario: One image belongs to one split
- **GIVEN** a source image has multiple seed masks
- **WHEN** it is assigned to a split
- **THEN** all labels for that image remain in the same split
