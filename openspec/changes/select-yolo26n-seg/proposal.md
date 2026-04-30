# Proposal — Select YOLO26n-seg

## Why

The project now has a final model-family decision: use Ultralytics YOLO26n for
the Advance Seeds segmentation model. The ML repo must stop treating YOLO26 as
an interchangeable future option and make YOLO26n-seg the explicit source model
for training, evaluation, metadata, and mobile export.

## What Changes

- Make `yolo26n-seg.pt` the default source weights for segmentation training and
  export metadata.
- Document YOLO26's end-to-end, NMS-free deployment assumption in the export
  contract.
- Keep the app-facing TFLite filename `yolo11n-seeds.tflite` only as a backward
  compatibility destination until the consuming app renames its asset path.
- Update README, model docs, OpenSpec config, and affected specs.

## Capabilities

### Modified Capabilities

- `segmentation-training`: source model is YOLO26n-seg.
- `mobile-model-export`: metadata records YOLO26n source weights and NMS-free
  output contract.

## Non-goals

- Training the model in this change.
- Changing the consuming app asset path.
- Removing TFLite/Core ML fallback behavior in the app.
- Adding quality-classifier training.

## Impact

Future training and exports are aligned to Ultralytics YOLO26n-seg. Mobile
handoff remains compatible with the current demo app while metadata clearly
identifies the real source model.
