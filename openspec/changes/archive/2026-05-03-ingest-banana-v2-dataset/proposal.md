# Proposal — Ingest Banana v2 Dataset

## Why

The banana PoC dataset has been revised in Roboflow and exported at
`/Users/ppungpong/Downloads/Advance Seeds.v3-banana-v2.yolo26`. The project
should train new banana models from this improved export while preserving the
canonical six-class ids.

## What Changes

- Add banana-v2 dataset and training configs.
- Update local banana training to default to banana-v2.
- Keep source class remapping from `0 banana` and `1 banana_ spot` to canonical
  ids `2 banana` and `3 banana_spot`.
- Keep heavy processed images, labels, weights, and run artifacts out of Git.

## Capabilities

### Modified Capabilities

- `dataset-preparation`: supports preparing the banana-v2 Roboflow export.
- `segmentation-training`: defaults local banana training to banana-v2.

## Non-goals

- Changing canonical class ids.
- Importing heavy dataset images into Git.
- Exporting a mobile model in this change.
