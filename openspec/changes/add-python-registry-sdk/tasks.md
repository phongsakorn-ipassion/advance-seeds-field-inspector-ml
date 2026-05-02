## 1. OpenSpec And Contracts

- [x] 1.1 Add OpenSpec proposal, design, and spec deltas for the Python registry SDK.
- [x] 1.2 Validate the new OpenSpec change.

## 2. SDK Core

- [x] 2.1 Add tests for registry environment loading and missing-setting errors.
- [x] 2.2 Implement registry config loading and custom error types.
- [x] 2.3 Add tests for run creation, metric logging, and finalization request shapes.
- [x] 2.4 Implement the registry HTTP client run lifecycle methods.
- [x] 2.5 Add tests for signed artifact upload and version registration.
- [x] 2.6 Implement artifact upload and version registration methods.

## 3. Training Integration

- [x] 3.1 Add tests for registry-disabled dry-run behavior.
- [x] 3.2 Add opt-in registry flags/env handling to `scripts/train_yolo26n_seg.py`.
- [x] 3.3 Add lifecycle finalization handling for success and failure.

## 4. Validation

- [x] 4.1 Run `python3 -m unittest discover -s tests`.
- [x] 4.2 Run `openspec validate --all --strict`.
- [x] 4.3 Update hand-off docs with SDK usage and remaining Plan 3/4 work.
