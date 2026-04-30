# calibration-validation Specification

## Purpose

Validate pixel-to-millimeter conversion and measurement error independently
from segmentation quality.

## Requirements

### Requirement: ArUco marker scale computation
The project SHALL provide helpers to compute `px_per_mm` from a detected marker
pixel size and a known marker millimeter size.

#### Scenario: 50 mm marker detected as 250 px
- **GIVEN** a marker is 50 mm wide
- **AND** the detected marker width is 250 px
- **WHEN** calibration scale is computed
- **THEN** `px_per_mm` equals 5

### Requirement: Pixel measurements convert to millimeters
The project SHALL convert pixel measurements to millimeters using the active
`px_per_mm` value.

#### Scenario: Pixel length converts through scale
- **GIVEN** `px_per_mm` is 5
- **WHEN** a seed length is 125 px
- **THEN** the converted length is 25 mm

### Requirement: Measurement error is reported in millimeters
Calibration validation SHALL report absolute measurement error in millimeters
against caliper-measured references.

#### Scenario: Known target error is computed
- **GIVEN** a known target is 10.0 mm
- **WHEN** the measured value is 10.4 mm
- **THEN** absolute error is 0.4 mm

### Requirement: Measurement acceptance target
Mobile-ready model releases SHALL be evaluated against a calibrated reference
set with length/width error target <= 0.5 mm.

#### Scenario: Error over target blocks release
- **GIVEN** a candidate model has mean length error of 0.7 mm
- **WHEN** release readiness is reviewed
- **THEN** the model is not approved for app handoff
