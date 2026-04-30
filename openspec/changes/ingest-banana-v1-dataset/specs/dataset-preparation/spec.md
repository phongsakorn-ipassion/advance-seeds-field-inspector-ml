# Spec — dataset-preparation

## ADDED Requirements

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
