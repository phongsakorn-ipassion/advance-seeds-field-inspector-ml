# mobile-model-export Specification Delta

## ADDED Requirements

### Requirement: Candidate model export set
The repository SHALL provide a repeatable script that exports named mobile
candidate models for app QA.

#### Scenario: Four banana candidates are exported
- **WHEN** the mobile candidate export script runs successfully
- **THEN** `runs/mobile-exports/1-v1/` contains Android and iOS artifacts
- **AND** `runs/mobile-exports/2-v1-quantized/` contains Android and iOS artifacts
- **AND** `runs/mobile-exports/3-v2/` contains Android and iOS artifacts
- **AND** `runs/mobile-exports/4-v2-quantized/` contains Android and iOS artifacts

### Requirement: Candidate manifests
Each exported candidate SHALL include a manifest that records platform artifact
paths, SHA-256 hashes, byte sizes, source weights, dataset config, training
results, and metadata path.

#### Scenario: Candidate manifest supports app download validation
- **WHEN** a candidate manifest is inspected
- **THEN** it contains a `tflite` artifact entry with `path`, `sha256`, and `size_bytes`
- **AND** it contains a `coreml` artifact entry with `path`, `sha256`, and `size_bytes`
- **AND** the candidate metadata path is recorded

### Requirement: Candidate index
The export workflow SHALL write a root `model-candidates.index.json` that lists
all exported candidate manifests.

#### Scenario: App agents discover local exports
- **WHEN** a developer serves `runs/mobile-exports/`
- **THEN** the consuming app can fetch `model-candidates.index.json`
- **AND** discover each candidate manifest and platform artifact

### Requirement: Dynamic loading handoff
The repository SHALL document how app agents should implement dynamic model
browsing, downloading, validation, activation, fallback, and rollback.

#### Scenario: App handoff covers both platforms
- **WHEN** an app agent reads `docs/dynamic-model-loading-handoff.md`
- **THEN** Android TensorFlow Lite loading requirements are described
- **AND** iOS Core ML package or compiled model loading requirements are described
- **AND** SHA-256 validation and smoke inference are required before activation
