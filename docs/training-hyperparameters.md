# Banana Training Hyperparameters

This is the default training profile for the banana/banana_spot PoC. New local
training runs use the banana-v2 dataset by default.

## Command

Dry-run:

```bash
python3 scripts/train_yolo26n_seg.py --dry-run
```

Smoke run:

```bash
python3 scripts/train_yolo26n_seg.py --epochs 3 --name banana-v1-smoke
```

PoC run:

```bash
python3 scripts/train_yolo26n_seg.py --config configs/train.banana-v2.yaml
```

Local machine training launcher:

```bash
scripts/train_local_banana.sh
```

The launcher creates `.venv` if needed, installs `.[train]` dependencies if
Ultralytics is missing, validates the banana dataset, writes a timestamped log
under `runs/logs/`, and starts the full configured PoC training run.

CLI overrides are forwarded to `scripts/train_yolo26n_seg.py`, for example:

```bash
scripts/train_local_banana.sh --epochs 3 --name banana-v2-smoke
```

## Defaults

| Parameter | Value | Rationale |
| --- | --- | --- |
| `model` | `yolo26n-seg.pt` | Selected YOLO26 nano segmentation model for mobile-oriented PoC. |
| `data` | `configs/dataset.banana-v2.yaml` | Processed Roboflow banana v2 dataset remapped to canonical ids. |
| `epochs` | `50` | Small-dataset fine-tuning baseline with early stopping. |
| `patience` | `20` | Stop if validation does not improve. |
| `imgsz` | `640` | Matches mobile export contract and YOLO26 default resolution. |
| `batch` | `auto` | Resolved at runtime: CUDA uses Ultralytics auto-batch, MPS/CPU use fixed safe values. |
| `optimizer` | `auto` | Let Ultralytics select the compatible optimizer for installed version/device. |
| `lr0` | `0.001` | Lower LR for small dataset fine-tuning. |
| `lrf` | `0.0495` | Follows YOLO26n pretraining LR decay profile. |
| `momentum` | `0.947` | YOLO26n pretraining value. |
| `weight_decay` | `0.00064` | YOLO26n pretraining value. |
| `warmup_epochs` | `1.0` | YOLO26n pretraining value rounded for fine-tuning. |
| `cos_lr` | `true` | Smooth decay for short fine-tuning runs. |
| `mosaic` | `0.5` | Reduced from YOLO26n pretraining for <1,000 image dataset. |
| `close_mosaic` | `10` | Disable mosaic near the end for cleaner final masks. |
| `mixup` | `0.0` | Disabled for small dataset and spot-mask fidelity. |
| `copy_paste` | `0.0` | Disabled for small dataset and defect-region fidelity. |
| `scale` | `0.56` | YOLO26n pretraining value; useful for size variation. |
| `translate` | `0.07` | YOLO26n pretraining value. |
| `fliplr` | `0.5` | Bananas/spots are left-right invariant enough for PoC. |
| `flipud` | `0.0` | Avoid unrealistic upside-down captures unless needed later. |
| `degrees` | `2.0` | Small rotation only; Roboflow already applied heavy augmentation. |
| `hsv_h` | `0.014` | YOLO26n pretraining value. |
| `hsv_s` | `0.5` | Moderate color augmentation for lighting variation. |
| `hsv_v` | `0.4` | Moderate brightness/value augmentation. |

## Hardware Auto-Tuning

By default, `scripts/train_yolo26n_seg.py` resolves hardware-sensitive settings
before training:

| Hardware | `device` | `batch` | `workers` | `amp` | `cache` |
| --- | --- | --- | --- | --- | --- |
| CUDA GPU | `0` | `-1` | up to `8` | `true` | `ram` if system RAM >= 24 GB |
| Apple Silicon | `mps` | `8` or `16` | up to `6` | `false` | `false` |
| CPU | `cpu` | `4` or `8` | up to `4` | `false` | `false` |

Use `--no-auto-hardware` to print or run the raw config values without resolving
`device`, `batch`, `workers`, `amp`, and `cache`.

## Notes

The source dataset has 693 images after Roboflow augmentation. Ultralytics'
YOLO26 guidance recommends keeping fine-tuning simple, and for datasets below
1,000 images it specifically recommends lower learning rate, fewer epochs with
patience, reduced mosaic, and disabling mixup/copy-paste.

The first run should be a 3-epoch smoke test. Only run the full 50-epoch PoC
after the smoke run proves the dataset, training environment, and output paths
are correct.
