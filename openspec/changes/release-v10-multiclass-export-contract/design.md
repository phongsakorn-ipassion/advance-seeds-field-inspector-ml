# Design — release-v10-multiclass-export-contract

## Context

Executes the deferred task 4.1 of `derive-export-class-names-from-model`. The export
candidate script is already class-count-agnostic; this change closes the two remaining
hardcoded/manual seams (the standalone metadata writer and the frozen contract) and lands
the v10 imbalance-mitigation training configs.

## Single source of truth for class names

Class names live in the dataset config YAML's `names:` block. Three consumers now agree:

| Consumer | Source of `class_names` |
| --- | --- |
| `export_mobile_model_candidates.py` | `model.names` (weights) — already implemented |
| `write_model_metadata.py` (standalone) | `--dataset-config` YAML → `load_class_names()` — **new** |
| `write_export_contract.py` (frozen contract) | `--dataset-config` YAML → `load_class_names()` — **new** |

`model.names` and the dataset YAML are the same data (Ultralytics reads `names:` at train
time), so all three converge. `load_class_names()` normalizes both dict-form (`{0: banana}`)
and list-form (`[banana, ...]`) `names:` into an index-ordered list, reusing the existing
`_normalize_names` / `_read_yaml_mapping` in `dataset.py`.

## Raw-seg output shape is class-count-dependent

The contract is currently `output_kind: segmentation_raw`, `nms_applied: false`. The raw
one-to-many head feature dim is `4 (box) + nc + 32 (mask coeffs)`:

| classes | output_shape |
| --- | --- |
| 2 (banana PoC) | `[1, 38, 8400]` |
| 5 (v9) | `[1, 41, 8400]` |
| **10 (v10)** | **`[1, 46, 8400]`** |

`raw_seg_output_shape(nc, imgsz)` already computes this; the generator just calls it with
`len(class_names)`.

## Cross-repo: required demo-app change (drafted, applied in the other repo)

The demo app parses the raw tensor `[1, 4+nc+32, 8400]`. With `nc` moving 2 → 10:

- The analyzer MUST read class scores from columns `4 .. 4+nc` (i.e. `4..14`) and mask
  coefficients from the final 32 columns (`14..46`) — driven by `class_names.length` from
  `model-metadata.json`, never a hardcoded `nc`.
- The label/colour map MUST cover all 10 classes; unknown indices fall back to a neutral label.
- Recommended: read `nc` from metadata and assert `output_shape[1] == 4 + nc + 32` at load,
  failing closed if the model and metadata disagree.

This repo only updates `configs/model_export_contract.json`; it does not ship a model. A
10-class release is gated on the app change + a trained v10 model (tasks 5.1–5.2).

## Imbalance mitigation (Part D)

v10 is extreme long-tail: corn ≈ 99k instances vs watermelon = 193 (ratio ≈ 0.002, far
below the repo's 5% balance floor). Ultralytics exposes no per-class loss weighting, so the
lever is data-level augmentation:

- `copy_paste: 0.3` — pastes instance masks across images; the strongest seg-friendly lever,
  but **class-agnostic** (samples all classes, not just rare ones).
- Keep `mosaic`/`fliplr`; document in the config header that watermelon needs real added
  data and that promotion must be judged on **per-class** mAP, not the corn-dominated mean.

## Testing

Stdlib `unittest` (no pytest). New tests cover `load_class_names` (dict/list/order/empty),
the `write_model_metadata.py --dataset-config` path (mutual exclusivity, derived classes +
shape), and `write_export_contract.py` (10-class contract, `[1,46,8400]`, frozen fields
preserved).
