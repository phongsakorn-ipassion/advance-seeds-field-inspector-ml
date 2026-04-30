# Proposal — Train Banana PoC

## Why

The banana and banana_spot dataset is now prepared and validates against the
canonical six-class contract. The next step is to provide a repeatable
YOLO26n-seg training entrypoint and document the hyperparameters for the first
banana-only PoC run.

## What Changes

- Add a committed training config for banana-v1.
- Add a Python training script with `--dry-run` support.
- Document the hyperparameter choices and smoke/full-run commands.
- Add tests for config loading, overrides, and command preview.

## Capabilities

### Modified Capabilities

- `segmentation-training`: adds a banana-v1 YOLO26n-seg training entrypoint and
  default hyperparameter profile.

## Non-goals

- Running the full training job in this change.
- Exporting TFLite/Core ML artifacts.
- Changing the dataset class contract.
- Tuning hyperparameters from experiment results.

## Impact

Developers can now run a deterministic dry-run, a short smoke train, and a full
banana-v1 PoC training run from the repo without hand-assembling Ultralytics
arguments.
