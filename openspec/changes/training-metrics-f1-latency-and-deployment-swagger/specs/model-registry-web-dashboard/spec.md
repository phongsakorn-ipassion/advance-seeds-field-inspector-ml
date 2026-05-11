## ADDED Requirements

### Requirement: Run detail shows derived F1-score per epoch
Run detail Training Metrics SHALL surface F1-score as a derived metric whenever both precision and recall MetricPoints are present.

#### Scenario: Precision and recall arrive for the same epoch
- **WHEN** `run_metrics` contains both a precision and a recall row for the same epoch of a run
- **THEN** Run detail SHALL render an F1 toggle card and an F1 trend-chart line
- **AND** the F1 value SHALL equal `2 * precision * recall / (precision + recall)`, or `0` when `precision + recall === 0`

#### Scenario: Only one of precision or recall is present
- **WHEN** an epoch has a precision MetricPoint but no recall MetricPoint, or vice versa
- **THEN** no F1 point SHALL be emitted for that epoch
- **AND** the F1 toggle card SHALL render `--` when no F1 points exist for the run

### Requirement: Run detail shows per-platform Inference Time
Run detail Training Metrics SHALL show Inference Time (ms) cards for PyTorch, TFLite, and CoreML sourced from the version produced by the run.

#### Scenario: Version metadata contains inference_ms entries
- **WHEN** the version produced by a run carries `metrics.inference_ms.pytorch`, `metrics.inference_ms.tflite`, or `metrics.inference_ms.coreml`
- **THEN** Run detail SHALL render a static three-card Inference Time row below the trend chart
- **AND** each card SHALL show the numeric value formatted as `<value> ms`

#### Scenario: Inference time missing for a platform
- **WHEN** a platform inference_ms field is absent from version metadata
- **THEN** the corresponding card SHALL render `--`
- **AND** the card SHALL show a `pending export` hint

### Requirement: Model detail shows F1-score in Performance
Model detail Performance SHALL show F1-score as a derived metric whenever the version metricsSummary contains both precision and recall.

#### Scenario: Version has precision and recall in summary
- **WHEN** `version.metricsSummary.precision` and `version.metricsSummary.recall` are both numbers
- **THEN** the Performance row SHALL include an F1-score `MetricCard`
- **AND** the value SHALL equal `2 * precision * recall / (precision + recall)`, or `0` when `precision + recall === 0`

#### Scenario: Version lacks one of precision or recall
- **WHEN** either precision or recall is missing from the version metricsSummary
- **THEN** the F1-score card SHALL render `--`

### Requirement: Model detail shows per-platform Inference Time
Model detail Performance SHALL show Inference Time (ms) cards for PyTorch, TFLite, and CoreML.

#### Scenario: Version metadata exposes inference_ms entries
- **WHEN** a version carries `metrics.inference_ms.pytorch`, `metrics.inference_ms.tflite`, or `metrics.inference_ms.coreml`
- **THEN** the Performance row SHALL include three additional `MetricCard`s labeled by platform
- **AND** each card SHALL show the numeric value formatted as `<value> ms`

#### Scenario: Inference time missing for a platform
- **WHEN** a platform inference_ms field is absent from version metadata
- **THEN** the corresponding card SHALL render `--`

### Requirement: Deployment section renders an embedded Swagger UI
Model detail Deployment SHALL render an embedded Swagger UI scoped to the current version and its active deployments.

#### Scenario: Version has at least one deployment
- **WHEN** Model detail Deployment renders for a version with one or more deployments
- **THEN** an embedded Swagger UI SHALL render inside the Mobile handoff panel
- **AND** the underlying OpenAPI 3.1 document SHALL include operations for `list-deployed-models`, `resolve-channel`, and `model-artifact/{kind}` for each artifact kind present on the version
- **AND** parameter defaults SHALL include the current `version.id` for `current_version` and `version.compatSignature` for `current_compat`

#### Scenario: Swagger module fails to load
- **WHEN** the dynamic import of `swagger-ui-react` fails at runtime
- **THEN** Deployment SHALL render a static endpoint list derived from the same OpenAPI spec
- **AND** SHALL NOT show a broken panel

## REMOVED Requirements

### Requirement: Deployment section exposes endpoint accordions
**Reason:** Replaced by an embedded Swagger UI panel that exposes the same endpoint data interactively from a dynamically-built OpenAPI 3.1 document.
**Migration:** The dashboard renders Swagger UI in place of the Model Picker, Default Model, and App Fields accordions. The Postman handoff card and external collection link are retained. No mobile-app contract change.
