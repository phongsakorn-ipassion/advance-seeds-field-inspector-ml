# Design — Ingest Banana v1 Dataset

## Context

The downloaded Roboflow export has:

- `train`, `valid`, `test` splits
- `data.yaml` with `names: ['banana', 'banana_ spot']`
- labels using local class ids `0` and `1`

The canonical repo class contract is:

```text
0 apple
1 apple_spot
2 banana
3 banana_spot
4 orange
5 orange_spot
```

## Decisions

### D1. Copy and remap into ignored processed data

The script copies source images and remapped labels into
`data/processed/advance-seeds-banana-v1`. This keeps the downloaded source
unchanged and keeps heavy files out of Git through the existing ignore policy.

### D2. Rename `valid` to `val`

The processed dataset uses `images/val` and `labels/val` to match the repo's
dataset config convention.

### D3. Commit the config, not the data

`configs/dataset.banana-v1.yaml` is committed. It points to the local processed
dataset root. The actual images and labels are local generated artifacts.

## Validation

- `python3 scripts/prepare_banana_dataset.py --source "<download>" --overwrite`
- `python3 scripts/validate_dataset.py configs/dataset.banana-v1.yaml`
- `python3 -m unittest discover -s tests`
- `openspec validate --all --strict`
