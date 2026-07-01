## 1. Auto-derive class names from dataset YAML (Part A)

- [x] 1.1 Add `load_class_names(yaml_path) -> list[str]` to `src/advance_seeds_ml/contracts.py`: read a dataset config's `names:` (dict or list) via the existing YAML reader, return an index-ordered list, raise `ValueError` on missing/empty names.
- [x] 1.2 Add `--dataset-config PATH` to `scripts/write_model_metadata.py`, mutually exclusive with `--classes`; exactly one required. When given, `class_names = load_class_names(path)`.
- [x] 1.3 Tests: dict-form names, list-form names, index ordering with unsorted keys, empty/missing raises, mutual-exclusivity of the two options.

## 2. Rule-based contract + class snapshot (Part B)

- [x] 2.1 Restructure `configs/model_export_contract.json`: replace the `output_shape` literal with `output_shape_rule` (`[1, 4 + num_classes + 32, anchors]`, num_classes from metadata); add `class_names_note` marking `class_names` as a snapshot, not the class-count source of truth.
- [x] 2.2 Add `scripts/write_export_contract.py --dataset-config PATH [--base ...] [--output ...]`: refresh only the `class_names` snapshot (via `load_class_names`), preserve all other fields, add no `output_shape` literal.
- [x] 2.3 Test: given a 10-name YAML the contract has 10 `class_names` in index order, NO `output_shape` literal, `output_shape_rule` preserved; frozen fields unchanged.
- [x] 2.4 Refresh `configs/model_export_contract.json` class snapshot from `configs/dataset.advance-seeds-v10.yaml`.

## 3. Imbalance mitigation configs (Part D)

- [x] 3.1 Add `configs/dataset.advance-seeds-v10.yaml`: absolute `path:` to the Downloads v10 bundle, 10 `names:`, metadata block.
- [x] 3.2 Add `configs/train.advance-seeds-v10.copy-paste.yaml`: `copy_paste: 0.3`, augmentation tuned for the long tail; header documents that copy_paste is class-agnostic and that watermelon (193 instances) needs more data + per-class eval.

## 4. Validate

- [x] 4.1 `python3 -m unittest discover -s tests` is green.
- [x] 4.2 `openspec validate release-v10-multiclass-export-contract --strict`.

## 5. Release gating (cross-repo — NOT in this change)

- [ ] 5.1 Demo app: update `SeedAnalyzer` / `TfliteSeedAnalyzer` to slice `4 + 10 + 32` columns and add a 10-entry class label/colour map (see `design.md`).
- [ ] 5.2 Train a real v10 model and export a 10-class `yolo11n-seeds.tflite` before pointing a channel at it.
