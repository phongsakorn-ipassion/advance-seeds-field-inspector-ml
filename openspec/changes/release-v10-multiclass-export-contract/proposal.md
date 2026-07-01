## Why

The export pipeline is already data-driven: `scripts/export_mobile_model_candidates.py`
derives `class_names` from the trained model's `model.names` and computes the raw-seg
`output_shape` from the class count (change `derive-export-class-names-from-model`). But
two things were deliberately left hardcoded / manual, tracked as that change's deferred
task 4.1 ("releasing a >2-class model to the app"):

1. `scripts/write_model_metadata.py` — the standalone metadata writer — still requires the
   operator to type `--classes` by hand, so it can drift from the dataset it was trained on.
2. `configs/model_export_contract.json` — the frozen contract with the app — still declares
   the banana-only PoC (`class_names: [banana, banana_spot]`, `output_shape: [1, 38, 8400]`).

The new Roboflow **v10 (dataset-v1.1)** export trains **10 classes**
(`banana, bitter_gourd, cantaloupe, corn, cucumber, eggplant, pepper, pumpkin, watermelon,
wax_gourd`). Under the current **raw segmentation** contract (`nms_applied: false`) the
detection feature dim is `4 + nc + 32`, so 10 classes changes the frozen `output_shape` from
`[1, 38, 8400]` to `[1, 46, 8400]`. Both the contract and the demo app's analyzer must move
in lockstep, or the app slices the raw tensor with the wrong class-column count and silently
mislabels every detection.

## What Changes

- **Auto-derive from dataset YAML.** Add `load_class_names(yaml_path)` to
  `src/advance_seeds_ml/contracts.py` (index-ordered list from a dataset config's `names:`),
  and give `scripts/write_model_metadata.py` a `--dataset-config PATH` option that supplies
  `class_names` from the YAML instead of manual `--classes`. `--classes` and
  `--dataset-config` are mutually exclusive; exactly one is required. `output_shape` continues
  to derive from the class count.
- **Regenerable frozen contract.** Add `scripts/write_export_contract.py` that emits
  `configs/model_export_contract.json` with `class_names` + raw-seg `output_shape` derived
  from a dataset config YAML, preserving all other frozen fields (thresholds, calibration,
  acceptance targets, the `yolo11n-seeds.tflite` alias). Regenerate the contract for the v10
  10-class release.
- **Imbalance mitigation configs (non-code).** Add `configs/dataset.advance-seeds-v10.yaml`
  and `configs/train.advance-seeds-v10.copy-paste.yaml` (copy-paste augmentation raised for
  the heavily long-tailed v10 class distribution).

## Cross-repo (demo app — NOT in this repo)

Shipping the 10-class contract REQUIRES the demo app to update its `SeedAnalyzer` /
`TfliteSeedAnalyzer` to slice `4 + 10 + 32` columns and carry a 10-entry class label/colour
map. This repo cannot edit that code; the required change is drafted in `design.md`. **The
contract file is updated here, but a 10-class model is not shipped to the app until the app
change lands and a real v10 model is trained + exported.**

## Capabilities

### Added Capabilities

- `mobile-model-export`: class names derivable from a dataset config YAML for the standalone
  metadata writer and the contract generator; the frozen export contract regenerated to
  reflect the released class set.

## Impact

- `src/advance_seeds_ml/contracts.py` — new `load_class_names()` helper.
- `scripts/write_model_metadata.py` — new `--dataset-config` option (mutually exclusive with `--classes`).
- `scripts/write_export_contract.py` — new contract generator.
- `configs/model_export_contract.json` — regenerated to the v10 10-class set, `output_shape: [1, 46, 8400]`.
- `configs/dataset.advance-seeds-v10.yaml`, `configs/train.advance-seeds-v10.copy-paste.yaml` — new.
- `tests/` — new unit tests for `load_class_names`, the `--dataset-config` path, and contract generation.
- **Gated:** a multi-class app release still requires the lockstep demo-app change and a trained v10 model.
