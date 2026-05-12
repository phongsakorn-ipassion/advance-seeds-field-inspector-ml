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

Banana v3 run:

```bash
python3 scripts/train_yolo26n_seg.py --config configs/train.banana-v3.yaml
```

Banana v4 baseline and controlled trials:

```bash
python3 scripts/train_yolo26n_seg.py --config configs/train.banana-v4.yaml
python3 scripts/train_yolo26n_seg.py --config configs/train.banana-v4.copy-paste.yaml
python3 scripts/train_yolo26n_seg.py --config configs/train.banana-v4.mask-quality.yaml
python3 scripts/train_yolo26n_seg.py --config configs/train.banana-v4.yolo26s.yaml
python3 scripts/train_yolo26n_seg.py --config configs/train.banana-v4.yolo26m.yaml
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

## Local YAML Defaults

These defaults describe the checked-in local training YAML and direct
`scripts/train_yolo26n_seg.py` workflow. Dashboard-created manual Colab runs
use the smaller dashboard contract in [Dashboard Run Requirements](#dashboard-run-requirements).

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
| `mask_ratio` | `4` | Default segmentation mask downsample ratio; use `2` only for mask-quality trials. |
| `overlap_mask` | `true` | Keep YOLO's default overlap handling for segmentation masks. |
| `box` | `7.5` | Box loss gain; tune only in controlled trials. |
| `cls` | `0.5` | Classification loss gain for banana vs banana_spot separation. |
| `multi_scale` | `0.0` | Disabled by default; enable only for scale-robustness trials. |

## Banana v4 Experiment Profiles

Banana v4 is the next first-class dataset target:

```bash
python3 scripts/validate_dataset.py configs/dataset.v4.yaml
```

Use `configs/train.banana-v4.yaml` as the production-candidate baseline. The
trial configs isolate one change at a time:

| Config | Purpose | Promotion gate |
| --- | --- | --- |
| `train.banana-v4.copy-paste.yaml` | Low Copy-Paste segmentation augmentation for spot recall. | Must improve banana_spot recall and preserve visual spot masks. |
| `train.banana-v4.mask-quality.yaml` | Higher `imgsz` and lower `mask_ratio` for mask detail. | Must beat baseline mask mAP and pass mobile latency checks. |
| `train.banana-v4.yolo26s.yaml` | Small model-capacity comparison. | Must justify added mobile cost over YOLO26n. |
| `train.banana-v4.yolo26m.yaml` | Medium model-capacity ceiling test. | Accuracy-only experiment until mobile runtime is proven. |

Evaluation summary after a full run:

```bash
python3 scripts/evaluate_model_summary.py \
  --weights runs/banana-v4/banana-v4-baseline/weights/best.pt \
  --data configs/dataset.v4.yaml \
  --output runs/banana-v4/banana-v4-baseline/evaluation-summary.json
```

## YOLO26 Source Weights

The dashboard source-weight selector offers the YOLO26 segmentation size
ladder, but it intentionally starts with no selection. Operators must choose a
checkpoint before creating a run so the registry row records an explicit
training source.

| Weight | Use when |
| --- | --- |
| `yolo26n-seg.pt` | Mobile-oriented fine-tuning baseline. |
| `yolo26s-seg.pt` | Balanced option when latency budget allows a larger model. |
| `yolo26m-seg.pt` | Accuracy-focused experiments with higher training/export cost. |
| `yolo26l-seg.pt` | Large-model validation runs before deciding whether mobile cost is acceptable. |
| `yolo26x-seg.pt` | Maximum-capacity local or Colab experiments, not a default mobile target. |

Banana v2 remains the local launcher default. Banana v3 configs are available
for explicit runs once the processed dataset exists under
`data/processed/advance-seeds-dataset-v3`.

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

## Dashboard Run Requirements

The Train new model page now requires all three inputs before it creates a run:

- Dataset config: uploaded YOLO dataset YAML.
- Dataset image bundle: uploaded ZIP containing images/labels referenced by
  the YAML.
- Source weights: explicit YOLO26 segmentation checkpoint selection.

Only `epochs` and `imgsz` are primary hyperparameters in the form. Advanced
hyperparameters contains only `patience`, `lr0`, and `batch`. New dashboard
runs persist only those five hyperparameter values, and the manual Colab
`scripts/train_for_run.py` path builds its training config from the same set.
Other YOLO tuning defaults belong to checked-in training YAML files, direct CLI
experiments, or Ultralytics defaults rather than the dashboard run config.

Colab accelerator selection is not stored in the dashboard run config. Runtime
choice stays in the actual Colab environment or training host.

## Registry Metric Names

Final model metadata stores normalized metrics in `metadata.metrics` while
preserving raw Ultralytics names under `metadata.metrics.raw`.

| Normalized key | Ultralytics source |
| --- | --- |
| `map50` | `metrics/mAP50(B)` |
| `map5095` | `metrics/mAP50-95(B)` |
| `precision` | `metrics/precision(B)` |
| `recall` | `metrics/recall(B)` |
| `maskMap50` | `metrics/mAP50(M)`, `mask_mAP50`, or `mask.map50` |
| `maskMap5095` | `metrics/mAP50-95(M)`, `mask_mAP`, or `mask.map50-95` |
| `maskPrecision` | `metrics/precision(M)` |
| `maskRecall` | `metrics/recall(M)` |

## Notes

The source dataset has 693 images after Roboflow augmentation. Ultralytics'
YOLO26 guidance recommends keeping fine-tuning simple, and for datasets below
1,000 images it specifically recommends lower learning rate, fewer epochs with
patience, reduced mosaic, and disabling mixup/copy-paste.

The first run should be a 3-epoch smoke test. Only run the full 50-epoch PoC
after the smoke run proves the dataset, training environment, and output paths
are correct.
