# Advance Seeds Field Inspector ML

Training and export workspace for the model artifacts used by the Advance Seeds
Field Inspector demo app.

This repository owns the ML side of the project:

- validate and split labeled seed/fruit datasets
- train an instance segmentation model
- evaluate segmentation and measurement quality
- validate calibration math against known-size references
- export mobile-ready model artifacts for the app repo

The consuming app repo is:

```text
/Users/ppungpong/Github/advance-seeds-field-inspector-demo
```

The app loads mobile artifacts from:

```text
/Users/ppungpong/Github/advance-seeds-field-inspector-demo/apps/mobile/assets/models/
```

## Current Contract With The App

The app already has a `SeedAnalyzer` runtime seam. This ML repo should produce:

| Artifact | Purpose |
| --- | --- |
| `yolo11n-seeds.tflite` | Android / cross-platform TFLite model consumed by `TfliteSeedAnalyzer` |
| `yolo11n-seeds.mlmodel` or compiled `.mlmodelc` | iOS Core ML artifact consumed by `CoreMLSeedAnalyzer` |
| `model-metadata.json` | model version, classes, thresholds, input size, output shape, calibration assumptions |

For the current app code, keep the TFLite filename stable:

```text
yolo11n-seeds.tflite
```

Even when the underlying trained model is YOLO26n, the app path currently uses
that historical filename.

## Repo Layout

```text
configs/
  dataset.example.yaml        Example YOLO segmentation dataset config
  model_export_contract.json  Expected metadata shape for app handoff
data/
  README.md                   Dataset placement and split rules
docs/
  app-handoff.md              How outputs move into the demo app
models/
  README.md                   Local trained/exported model artifacts
scripts/
  validate_dataset.py         Validate YOLO-seg labels and split coverage
  write_model_metadata.py     Write app-facing model-metadata.json
  export_to_demo.py           Copy exported artifacts into the demo app
src/advance_seeds_ml/
  calibration.py              Calibration and measurement-error helpers
  contracts.py                Model metadata contract helpers
  dataset.py                  YOLO segmentation dataset validation
tests/
  test_*.py                   Stdlib unit tests for scaffold behavior
```

## Quickstart

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
python -m pip install -e .
python -m unittest discover -s tests
```

Dataset validation does not require training dependencies:

```bash
python scripts/validate_dataset.py configs/dataset.example.yaml
```

Create metadata for an exported model:

```bash
python scripts/write_model_metadata.py \
  --model-name yolo26n-seg \
  --model-version 0.1.0 \
  --input-size 640 \
  --classes seed damaged_seed immature_seed foreign_material \
  --output models/model-metadata.json
```

Copy artifacts into the demo app after export:

```bash
python scripts/export_to_demo.py \
  --tflite models/yolo11n-seeds.tflite \
  --metadata models/model-metadata.json
```

## Training Flow

1. Place labeled data in YOLO segmentation layout under `data/`.
2. Validate labels and class distribution.
3. Lock train/val/test splits by image.
4. Train the segmentation model.
5. Evaluate:
   - segmentation mAP >= 0.85
   - mask mAP >= 0.80
   - length/width error <= 0.5 mm against calibrated references
6. Export TFLite and Core ML artifacts.
7. Copy the mobile artifacts into the demo app.

## Calibration Principle

Model outputs are pixels. The app reports millimeters only after calibration.
This repo validates calibration separately from segmentation:

- ArUco known marker size -> `px_per_mm`
- LiDAR / depth measurements -> app runtime path
- known caliper target -> measurement error report

Any exported metadata should state whether a model has been evaluated with
calibrated millimeter measurements or only pixel-space segmentation.
