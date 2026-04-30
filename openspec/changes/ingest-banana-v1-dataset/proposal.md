# Proposal — Ingest Banana v1 Dataset

## Why

The first real PoC data is a Roboflow YOLO26 export at
`/Users/ppungpong/Downloads/Advance Seeds.v2-banana-v1.yolo26`. Its labels use
local class ids `0 banana` and `1 banana_ spot`, but the project-wide class
contract requires `2 banana` and `3 banana_spot`.

## What Changes

- Add a banana dataset preparation script that copies the downloaded dataset
  into `data/processed/advance-seeds-banana-v1`.
- Remap label ids from `0 -> 2` and `1 -> 3`.
- Write a dataset config at `configs/dataset.banana-v1.yaml`.
- Keep heavy images and remapped labels out of Git.
- Add tests for the label remapping helpers.

## Capabilities

### Modified Capabilities

- `dataset-preparation`: supports preparing the banana-v1 Roboflow export for
  the canonical six-class contract.

## Non-goals

- Training the model.
- Editing the original downloaded dataset.
- Importing heavy image files into Git.
- Changing the canonical class ids.

## Impact

After running the preparation script, the banana dataset can be validated with
the repo's dataset validator and used for the first YOLO26n-seg training run.
