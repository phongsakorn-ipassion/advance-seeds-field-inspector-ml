## Overview

The change keeps manual Colab as the active training path and improves the dashboard/metadata contract around it. Required dashboard inputs prevent unusable run rows. The metric work uses the existing `run_metrics` table for live history and `versions.metadata.metrics` for final model records.

## Dashboard Behavior

`TrainConfig.sourceWeights` remains a string but defaults to `""`. The Train form validates `dataset`, `datasetBundle`, and `sourceWeights` before calling the store. Field-level errors render next to those controls and clear as the operator fixes inputs.

The primary hyperparameter grid shows only `epochs` and `imgsz`. Advanced hyperparameters contains only `patience`, `lr0`, and `batch`. The Colab accelerator select is removed, and new run config no longer writes `colab_accelerator`. Readers tolerate old rows by ignoring or defaulting deprecated accelerator data.

Runs gain:

- `metricsHistory`: normalized metric points from `run_metrics`.
- `metricsSummary`: latest normalized values.

Model versions gain the same `metricsSummary` from metadata. Older metadata renders unavailable values as `--`.

## Metric Normalization

Normalize standard Ultralytics names into stable keys:

- `metrics/mAP50(B)` and `mAP50` -> `map50`
- `metrics/mAP50-95(B)` -> `map5095`
- `metrics/precision(B)` -> `precision`
- `metrics/recall(B)` -> `recall`
- `metrics/mAP50(M)` -> `maskMap50`
- `metrics/mAP50-95(M)` and `mask_map` -> `maskMap5095`
- `metrics/precision(M)` -> `maskPrecision`
- `metrics/recall(M)` -> `maskRecall`

The run chart plots metric history by epoch/step. It is intentionally SVG/CSS only, avoiding new chart dependencies.

## Metadata Contract

`scripts/train_for_run.py` builds `metadata.metrics` with normalized fields plus a `raw` object copied from `results.results_dict`. The hosted callback also normalizes any success payload metrics and stores raw values, so hosted compatibility remains intact without changing the database.

The dashboard maps final metrics from either new normalized metadata or older legacy keys (`map50`, `mask_map`) for backward compatibility.

## Documentation

Update dashboard, segmentation-training, and model-registry specs. Update docs to state that accelerator selection is handled in Colab/runtime, not dashboard config, and that final metrics use the normalized names above.
