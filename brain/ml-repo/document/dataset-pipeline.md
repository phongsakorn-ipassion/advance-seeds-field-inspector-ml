---
project: ml-repo
type: reference
status: active
tags: [dataset, yolo, validation]
created: 2026-06-22
updated: 2026-06-22
sources: [src/advance_seeds_ml/dataset.py, scripts/validate_dataset.py, data/README.md, configs/dataset.advance-seeds-v8.yaml]
canonical: true
---

# Dataset pipeline (YOLO-seg) (canonical)

> [!abstract] TL;DR
> The repo validates YOLO-segmentation datasets in a **type-first** layout
> (`images|labels / {train,val,test}`). Roboflow exports are **split-first**
> (`{train,valid,test}/{images,labels}`) and must be restructured before they validate.

## The layout the validator expects

`src/advance_seeds_ml/dataset.py:137` (`_label_dir_for`) derives the label dir by
swapping a leading `images/` → `labels/`. So the canonical layout (and what
`data/README.md` documents) is:

```
data/processed/<name>/
  images/{train,val,test}
  labels/{train,val,test}
```

Config keys are `train/val/test` (note: **`val`, not `valid`**). Example:
`configs/dataset.advance-seeds-v8.yaml`.

> [!warning] A raw Roboflow export will NOT validate as-is: its `{split}/images`
> layout makes the validator look for `labels/images`, and it uses `valid` not `val`.
> Restructure (split-first → type-first, `valid`→`val`) first.

## What the validator checks (`validate_yolo_seg_dataset`)
- image↔label pairing per split (`dataset.py:174`)
- duplicate image *content* across splits via sha256 (`dataset.py:189`) — leakage guard
- per-row polygon sanity (`validate_yolo_seg_line`, `dataset.py:237`): ≥3 points
  (≥7 fields), even coord count, class id in `names`, coords in `[0,1]`, non-zero area
- class balance: flags if smallest/largest instance ratio < 0.05 (`dataset.py:221`)

It has a tiny built-in YAML fallback parser (`dataset.py:51`) so it runs without
PyYAML installed.

## Run it
> [!tip] `python3 scripts/validate_dataset.py configs/dataset.advance-seeds-v8.yaml`
> Prints split counts, `class_counts`, and any issues; exit 1 if issues, else `ok`.

## Current datasets
- **v8 (dataset-v2)** — 4 classes `banana, banana_spot, pepper, watermelon`,
  2457 images (train 2121 / val 179 / test 157). Roboflow export restructured into
  `data/processed/advance-seeds-v8/` (gitignored). See [[drift-register]] (D-V8-CLASSES)
  for how this diverges from the banana-only export contract.

## Related
- [[training-to-registry-flow]] — classes from this YAML drive training
- [[model-export-contract]]
