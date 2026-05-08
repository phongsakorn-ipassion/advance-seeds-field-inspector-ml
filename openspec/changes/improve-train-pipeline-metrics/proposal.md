## Why

Operators need the Train pipeline to prevent incomplete manual Colab runs and to show the model-quality signal that matters while training is still running. The dashboard currently allows missing dataset/image/weight inputs, exposes a Colab accelerator choice that is no longer part of the operating flow, and only surfaces a narrow metric summary.

## What Changes

- Require dataset YAML, dataset image bundle, and source weights before creating a training run.
- Keep epochs and image size as primary hyperparameters, with only patience, LR0, and batch in Advanced hyperparameters.
- Remove dashboard Colab accelerator selection and stop writing new accelerator config.
- Add run-detail metric cards and a compact chart for live mAP50, mAP50-95, precision, recall, and mask equivalents from `run_metrics`.
- Persist normalized final metric summaries into version metadata while keeping raw YOLO metric names for audit/debug.
- Update docs to describe the required inputs, removed accelerator choice, and metric naming.

Non-goals:

- Do not enable or promote paid hosted training.
- Do not change the mobile app runtime contract or add mobile UI.
- Do not add a database migration; existing JSON metadata and `run_metrics` are sufficient.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `model-registry-web-dashboard`: Train form validation, accelerator removal, live metric visualization, and model detail metric display.
- `segmentation-training`: Training outputs include normalized final metric summaries.
- `model-registry`: Version metadata exposes normalized and raw training metrics for service consumers.

## Impact

- Dashboard code in `apps/web/src`.
- Manual Colab script `scripts/train_for_run.py`.
- Hosted worker metric parsing compatibility in `packages/training-worker`.
- Supabase callback success metadata handling.
- OpenSpec specs and training/hosted-training docs.
