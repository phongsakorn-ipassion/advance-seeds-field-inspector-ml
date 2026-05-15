## Why

Operators need to validate trained segmentation models against real produce on the bench before promoting them to the mobile app. The existing `scripts/run_segmentation.py` produced annotated masks but reported nothing in real-world units — no width, no length, no area, no volume — so calibration regressions surfaced only after mobile rollout. There was also no live ArUco scale calibration in the inspector, even though `calibration-validation` already requires `px_per_mm` from ArUco markers for release acceptance.

## What Changes

- Add per-instance pixel and millimeter measurements to the inspector: axis-aligned bbox, rotated min-area rect (length/width), raster mask area, perimeter, aspect ratio, circularity.
- Add a pluggable scale provider with three sources: `none` (pixel-only), `manual` (`--mm-per-pixel`), and `aruco` (per-frame marker detection via `cv2.aruco.ArucoDetector`).
- Add volume (mL) and weight (g) estimation per detected class via a YAML class config (`configs/volume.example.yaml`). Two shape models are supported: spherical (area-equivalent sphere) and oblong (PCA-rotated disk method, vectorized over mask columns). The class→shape mapping lives in data, not code.
- Add CSV export of every per-frame, per-instance measurement under `<project>/<name>/`.
- Add inference throughput controls: device auto-pick (MPS on Apple Silicon, CUDA when available, CPU fallback), `--half` for fp16 on MPS/CUDA, `--aruco-stride` to skip redundant marker scans, `--log-every` to throttle stdout, threaded webcam capture with always-latest-frame semantics, and a cached class-color LUT.

Non-goals:

- Do not add a calibration validation report or release-gate script — `calibration-validation` already covers that capability; this change only exposes a *runtime* scale source that the validation pipeline can consume.
- Do not add hardware depth (LiDAR, RealSense) inference paths. The `ScaleProvider` interface is designed so a `LidarScaleProvider` can drop in later; that work belongs to the mobile app.
- Do not change the mobile artifact contract, training pipeline, or model registry behavior.
- Do not hardcode produce class names; all class-specific behavior lives in `configs/volume.example.yaml`.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `calibration-validation`: Adds runtime ArUco-based `px_per_mm` provider, per-instance geometric measurement, and class-config-driven volume/weight estimation that consume the scale.

## Impact

- `scripts/run_segmentation.py` — measurement, scale providers, volume estimators, CLI flags.
- `configs/volume.example.yaml` — new example config for class→shape/density mapping.
- OpenSpec `calibration-validation` spec — additional requirements for runtime scale and measurement outputs.
- No database, mobile, or training-pipeline changes.
