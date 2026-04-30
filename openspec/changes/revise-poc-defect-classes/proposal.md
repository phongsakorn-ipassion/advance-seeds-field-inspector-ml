# Proposal — Revise PoC Defect Classes

## Why

The PoC class contract needs to support quality/defect detection, not only
whole-object segmentation. The first defect target is visible spot regions on
apple, banana, and orange. These labels must be locked before annotation and
training so class ids stay consistent.

## What Changes

- Replace the previous five-class produce set with six classes:
  `0 apple`, `1 apple_spot`, `2 banana`, `3 banana_spot`, `4 orange`,
  `5 orange_spot`.
- Remove Broccoli and Carrot from the current PoC.
- Update dataset config, model metadata contract, docs, tests, and OpenSpec.
- Treat spot labels as separate segmentation classes for defect/quality regions.

## Capabilities

### Modified Capabilities

- `dataset-preparation`: label config uses the six object/spot classes.
- `segmentation-training`: YOLO26n-seg trains whole-object and spot masks.
- `mobile-model-export`: metadata exports the six-class object/defect contract.

## Non-goals

- Training the model.
- Adding disease-specific spot types.
- Adding a separate quality classifier.
- Changing the app-side filename for the TFLite artifact.

## Impact

Existing labels using the prior five-class order must be relabeled or migrated.
Any banana-only test should now use class id `2` for banana and class id `3` for
banana spots.
