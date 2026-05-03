# Spec — dataset-preparation

## ADDED Requirements

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
