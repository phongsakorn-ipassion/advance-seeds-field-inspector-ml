## ADDED Requirements

### Requirement: Training finalizes normalized metrics
Training scripts SHALL produce a normalized final metric summary for registry model versions.

#### Scenario: Manual Colab run succeeds
- **WHEN** `scripts/train_for_run.py` completes training and exports model artifacts
- **THEN** the version metadata SHALL contain normalized final metrics for mAP50, mAP50-95, precision, recall, and mask equivalents when emitted by Ultralytics
- **AND** raw YOLO metric names SHALL be preserved for audit/debug

#### Scenario: Metric is unavailable
- **WHEN** Ultralytics does not emit a specific metric
- **THEN** the normalized metric summary SHALL omit that field rather than storing a false zero
