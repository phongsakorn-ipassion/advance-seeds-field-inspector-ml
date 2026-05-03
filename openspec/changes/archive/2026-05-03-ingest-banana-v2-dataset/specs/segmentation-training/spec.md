# Spec — segmentation-training

## ADDED Requirements

### Requirement: Banana v2 local training default
The local banana training launcher SHALL train from the banana-v2 config by
default.

#### Scenario: Local launcher uses banana-v2 config
- **WHEN** `scripts/train_local_banana.sh --dry-run` runs
- **THEN** it validates `configs/dataset.banana-v2.yaml`
- **AND** it passes `configs/train.banana-v2.yaml` to the training entrypoint
