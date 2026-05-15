## Overview

The inspector script gains a measurement pipeline with three composable layers: a `ScaleProvider` that yields `mm_per_pixel` per frame, a geometry pass (`measure_instance`) that produces dimensional features from the mask polygon plus raster, and a shape-dispatched volume estimator (`estimate_volume`) that consumes geometry + scale + a per-class YAML config. All three layers degrade gracefully when their inputs are missing: with no scale, measurement still reports pixel features; with no volume config, geometry still flows; with no measurement at all, the existing inference loop is unchanged.

## Repository Layout

```text
scripts/
  run_segmentation.py         Inspector CLI (measurement, scale, volume, FPS).
configs/
  volume.example.yaml         Per-class shape + density config example.
openspec/changes/
  add-measurement-inference-cli/
    proposal.md
    design.md
    tasks.md
    specs/calibration-validation/spec.md   Capability delta.
```

## Scale Provider Interface

Three implementations sit behind a common contract:

- `update(frame) -> ScaleResult` — given the current BGR frame, return the active scale.
- `last() -> ScaleResult` — return the most recently observed scale without re-running detection. Used when the caller throttles updates via `--aruco-stride`.

`ScaleResult` carries `mm_per_pixel: float | None`, `source: "none"|"manual"|"aruco"`, and (for ArUco) `marker_corners_px` and `marker_id` so the overlay can draw the detected fiducial.

`ArucoScaleProvider` is built on `cv2.aruco.ArucoDetector` (OpenCV ≥ 4.7, already pinned in `pyproject.toml`). When the marker is briefly occluded the provider returns the last-known `ScaleResult` instead of `None`, preventing UI strobing while preserving honesty about the source.

The interface is explicitly designed so a future `LidarScaleProvider` (mobile-side, ARKit/RealSense) can be added without touching `measure_instance` or `estimate_volume`. That work is out of scope here.

## Measurement Pass

`measure_instance(polygon, mask_bool, scale, cv2, np)` returns a dict containing:

- AABB width / height (`aabb_w_px`, `aabb_h_px`).
- Rotated min-area rect length and width (`length_px`, `width_px`), sorted so `length >= width` for stable CSV columns regardless of orientation angle.
- Raster mask area (`area_px`, from `result.masks.data.sum()`), polygon perimeter (`perimeter_px`).
- Derived shape descriptors: `aspect_ratio`, `circularity`.
- `scale_source`, `mm_per_pixel`, plus matching mm/mm² columns when scale is present.

The polygon comes from `result.masks.xy`; the raster mask from `result.masks.data`. Raster area is preferred over polygon area (`cv2.contourArea`) because the raster reflects what the network actually predicted and is consistent with the `mask mAP >= 0.80` acceptance target in `project-governance`.

## Volume Estimation

Shape strategies are class-agnostic at the code level; the per-class mapping is data:

```yaml
defaults:
  shape: skip
  density_g_per_ml: 1.0
  finagling_factor: 1.0
classes:
  banana:
    shape: oblong
    density_g_per_ml: 0.94
```

Strategies:

- **spherical** — invert silhouette area to an equivalent sphere radius `r = sqrt(A/π)`, then `V = (4/3)π r³`.
- **oblong** — rasterize the polygon into a local mask, PCA the polygon vertices to find the long axis (O(P) instead of O(H·W) PCA-on-mask), rotate so the axis is horizontal, then sum disk volumes column-by-column. The disk loop is vectorized as a single `np.count_nonzero(rotated, axis=0)` + `(π·r²·dx).sum()`.

Both strategies require `scale.mm_per_pixel` and silently produce `{}` when scale is missing.

A `finagling_factor` per class scales spherical output to absorb systematic bias (e.g., onions are oblate, not spherical). Oblong has no factor because the disk method is geometry-driven and does not rely on a shape prior.

## Performance Knobs

- Auto-pick `device`: `mps` on Apple Silicon, `0` on CUDA, `cpu` otherwise. Single largest FPS win on macOS (3–5×).
- `--half` enables fp16 on MPS/CUDA; silently ignored on CPU.
- `--aruco-stride N` re-detects only every N frames; intermediates reuse `provider.last()`.
- `--log-every N` throttles per-frame stdout.
- Threaded `cv2.VideoCapture` with a single-slot, lock-protected latest-frame buffer. Trades end-to-end latency for stable throughput on slow inference.
- Cached class-color LUT replaces per-polygon RNG allocation.

## Calibration Acceptance Contract

The `calibration-validation` capability already gates mobile-ready releases on `length/width error <= 0.5 mm`. This change does not modify that target; it only adds the runtime measurement source that the validation pipeline can consume. Per-frame ArUco scale is preserved in the CSV (`scale_source`, `mm_per_pixel`) so the validation workflow can join measurements against ground-truth references.

## Consuming-App Contract

No change. The inspector script is a bench tool for ML engineers; the mobile app continues to consume only TFLite + metadata as defined by `mobile-model-export`.
