# Design — Define PoC Classes

## Context

The project uses YOLO26n-seg as the segmentation model and needs a first
training target. The user selected Apple, Banana, Broccoli, Carrot, and Orange
for the PoC. The class order must be stable because YOLO label files store
numeric ids, while the app and metadata need human-readable names.

## Class Contract

| id | class |
| --- | --- |
| 0 | apple |
| 1 | banana |
| 2 | broccoli |
| 3 | carrot |
| 4 | orange |

Class names are lowercase ASCII in configs and metadata. User-facing app labels
can title-case or translate them later.

## Decisions

### D1. Treat object type as the segmentation class

For the PoC, each object mask belongs to one of the five produce classes. We are
not adding defect, quality, or variety labels yet. Measurement remains classical
mask geometry plus calibration.

### D2. Keep the class list consistent across all contracts

The same class list appears in:

- `configs/dataset.example.yaml`
- `configs/model_export_contract.json`
- generated `model-metadata.json`
- OpenSpec specs
- tests

### D3. Future class additions require a new change

Changing class ids after labeling begins is expensive. Any later class addition
or reordering must be handled as an explicit OpenSpec change with migration
notes for existing labels and model metadata.

## Validation

- Dataset config loads and reports the five classes.
- Metadata generation emits the five classes.
- OpenSpec strict validation passes.
- Unit tests pass.
