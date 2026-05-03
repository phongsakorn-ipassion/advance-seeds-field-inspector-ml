# dataset-preparation Specification

## Purpose

Ensure labeled client images are valid, split safely, and ready for YOLO
segmentation training without data leakage.
## Requirements
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

### Requirement: Banana v1 Roboflow ingestion
The project SHALL provide a script to prepare the Roboflow banana-v1 YOLO26
export for the canonical six-class dataset contract without modifying the
downloaded source dataset.

#### Scenario: Banana labels are remapped to canonical ids
- **GIVEN** a source label row starts with class id `0`
- **WHEN** the banana ingestion script writes the processed label
- **THEN** the output row starts with class id `2`

#### Scenario: Banana spot labels are remapped to canonical ids
- **GIVEN** a source label row starts with class id `1`
- **WHEN** the banana ingestion script writes the processed label
- **THEN** the output row starts with class id `3`

#### Scenario: Processed dataset validates
- **GIVEN** the banana ingestion script has completed
- **WHEN** `python3 scripts/validate_dataset.py configs/dataset.banana-v1.yaml` runs
- **THEN** validation passes with banana and banana_spot labels under the canonical six-class config

### Requirement: Banana v2 Roboflow ingestion
The project SHALL prepare the Roboflow banana-v2 YOLO26 export for the
canonical six-class dataset contract without modifying the downloaded source
dataset.

#### Scenario: Banana v2 labels are remapped to canonical ids
- **GIVEN** a banana-v2 source label row starts with class id `0`
- **WHEN** the banana ingestion script writes the processed label
- **THEN** the output row starts with class id `2`

#### Scenario: Banana v2 spot labels are remapped to canonical ids
- **GIVEN** a banana-v2 source label row starts with class id `1`
- **WHEN** the banana ingestion script writes the processed label
- **THEN** the output row starts with class id `3`

#### Scenario: Banana v2 processed dataset validates
- **GIVEN** the banana-v2 ingestion script has completed
- **WHEN** `python3 scripts/validate_dataset.py configs/dataset.banana-v2.yaml` runs
- **THEN** validation passes with banana and banana_spot labels under the canonical six-class config

