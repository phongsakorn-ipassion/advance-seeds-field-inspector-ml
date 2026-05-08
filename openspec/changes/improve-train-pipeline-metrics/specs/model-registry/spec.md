## ADDED Requirements

### Requirement: Version metadata exposes model quality metrics
The registry SHALL expose final model-quality metrics in `versions.metadata.metrics` for dashboard and service consumers.

#### Scenario: Version is registered after training
- **WHEN** a successful training run creates a version
- **THEN** `versions.metadata.metrics` SHALL include normalized metric keys for available mAP50, mAP50-95, precision, recall, and mask metrics
- **AND** raw training metric names SHALL remain available in metadata

#### Scenario: Mobile service returns model metadata
- **WHEN** a service endpoint returns a version metadata object
- **THEN** callers SHALL be able to read the normalized metrics without parsing raw YOLO metric names
