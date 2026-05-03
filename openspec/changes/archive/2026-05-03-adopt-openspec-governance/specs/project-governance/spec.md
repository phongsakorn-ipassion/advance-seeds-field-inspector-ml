# Spec — project-governance

## ADDED Requirements

### Requirement: OpenSpec governs ML repo changes
The project SHALL use OpenSpec as the source of truth for non-trivial changes to
dataset preparation, segmentation training, calibration validation, and mobile
model export behavior.

#### Scenario: New work starts from OpenSpec
- **GIVEN** a developer is about to implement a new training or export behavior
- **WHEN** the behavior changes project capabilities
- **THEN** an active OpenSpec change exists before implementation begins

### Requirement: OpenSpec validation is part of completion
The project SHALL run `openspec validate --all --strict` before considering
OpenSpec-governed work complete.

#### Scenario: Validation catches stale specs
- **GIVEN** a change modifies OpenSpec artifacts
- **WHEN** validation fails
- **THEN** the work is not considered complete until the validation errors are fixed
