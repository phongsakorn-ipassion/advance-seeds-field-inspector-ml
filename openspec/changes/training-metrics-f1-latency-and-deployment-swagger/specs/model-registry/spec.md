## ADDED Requirements

### Requirement: Version metadata exposes optional per-platform inference time
Version metadata SHALL accept optional numeric `metrics.inference_ms.pytorch`, `metrics.inference_ms.tflite`, and `metrics.inference_ms.coreml` fields representing measured inference latency in milliseconds for each exported artifact. The shape SHALL be additive and backward compatible with existing metadata documents that omit these fields.

#### Scenario: Metadata includes inference_ms values
- **WHEN** version metadata contains numeric values under `metrics.inference_ms.pytorch`, `metrics.inference_ms.tflite`, or `metrics.inference_ms.coreml`
- **THEN** dashboard consumers SHALL read those values and surface them as per-platform latency

#### Scenario: Metadata omits inference_ms values
- **WHEN** version metadata omits the `metrics.inference_ms` object or any of its platform fields
- **THEN** dashboard consumers SHALL treat the missing value as unavailable
- **AND** SHALL NOT fail to render the version
