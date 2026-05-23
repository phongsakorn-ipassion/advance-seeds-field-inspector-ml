## ADDED Requirements

### Requirement: Detection limit controls on training form

The training form SHALL expose `max_det`, `iou`, and `conf` controls per
platform (iOS, Android) alongside the existing Quantization controls,
defaulting to maxDet=300 / iou=0.7 / conf=0.25. The controls SHALL be
always visible (not collapsed) and SHALL surface a summary chip below the
inputs and a Reset-to-defaults action.

#### Scenario: Operator overrides max_det

- **GIVEN** an admin opens the Train workflow
- **WHEN** they set iOS maxDet to 150
- **THEN** the form persists `exportOptions.ios.nms.maxDet=150` on the
  resulting run row and the summary chip reflects the new value.

#### Scenario: Out-of-range input is rejected

- **GIVEN** an admin types `iou=2.0`
- **WHEN** they submit the form
- **THEN** the form surfaces a field error and does NOT dispatch the run.
