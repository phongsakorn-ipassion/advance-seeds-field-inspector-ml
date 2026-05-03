## ADDED Requirements

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
