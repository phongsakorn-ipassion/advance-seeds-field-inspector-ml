# Proposal — Define PoC Classes

## Why

The PoC needs a concrete model label set before dataset preparation and training
can begin. The selected first classes are Apple, Banana, Broccoli, Carrot, and
Orange. Locking this now prevents class-id drift across annotation, training,
metadata, and app handoff.

## What Changes

- Set the canonical PoC class order to:
  `0 apple`, `1 banana`, `2 broccoli`, `3 carrot`, `4 orange`.
- Update the example YOLO dataset config and metadata contract.
- Update README, dataset docs, app handoff docs, and OpenSpec specs.
- Update tests to assert the PoC class contract.

## Capabilities

### Modified Capabilities

- `dataset-preparation`: dataset config exposes the five PoC classes.
- `segmentation-training`: PoC training uses the five-class label set.
- `mobile-model-export`: metadata exports the same class list.

## Non-goals

- Training the model.
- Renaming the app TFLite asset path.
- Adding quality/defect classes.
- Adding variety classes beyond the five selected PoC classes.

## Impact

All future PoC datasets and model metadata now share a stable class order. Any
later class additions must be made through a new OpenSpec change.
