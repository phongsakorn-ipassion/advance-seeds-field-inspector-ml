# Design — Train Banana PoC

## Context

The processed banana dataset exists locally under
`data/processed/advance-seeds-banana-v1` and validates with 624 train images, 42
validation images, 27 test images, 1,325 banana masks, and 592 banana_spot masks.

Ultralytics' YOLO26 guidance says defaults are a strong baseline, while small
datasets below 1,000 images should use fewer epochs with patience, lower
learning rate, reduced mosaic, and disabled mixup/copy-paste.

## Decisions

### D1. Commit a training config

`configs/train.banana-v1.yaml` stores the full first-run hyperparameter set so
training does not depend on chat history.

### D2. Train through Python API, preview CLI

`scripts/train_yolo26n_seg.py` uses `ultralytics.YOLO(...).train(...)` for
execution and prints an equivalent `yolo segment train ...` command. This gives
repeatability plus an easy way to inspect the final arguments.

### D3. Start with smoke training

The script defaults to a 50-epoch PoC profile, but supports:

```bash
python3 scripts/train_yolo26n_seg.py --epochs 3 --name banana-v1-smoke
```

The smoke run should happen before any full training run.

## Hyperparameter Profile

Key defaults:

- `model: yolo26n-seg.pt`
- `data: configs/dataset.banana-v1.yaml`
- `epochs: 50`
- `patience: 20`
- `imgsz: 640`
- `batch: -1`
- `lr0: 0.001`
- `mosaic: 0.5`
- `mixup: 0.0`
- `copy_paste: 0.0`
- `close_mosaic: 10`

Full details are documented in `docs/training-hyperparameters.md`.

## Validation

- `python3 scripts/train_yolo26n_seg.py --dry-run`
- `python3 -m unittest discover -s tests`
- `openspec validate --all --strict`
