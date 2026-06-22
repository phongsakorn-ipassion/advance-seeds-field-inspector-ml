---
project: ml-repo
type: reference
status: active
tags: [calibration, measurement, mm]
created: 2026-06-22
updated: 2026-06-22
sources: [src/advance_seeds_ml/calibration.py]
canonical: false
---

# Calibration (px ↔ mm)

> [!abstract] TL;DR
> Stateless math turning pixel measurements into millimetres and quantifying measurement
> error. The model emits pixels; mm is only valid **after** calibration.

## Surface (`src/advance_seeds_ml/calibration.py`)
- `px_per_mm(marker_size_px, marker_size_mm)` → scale from a known reference (e.g. ArUco).
- `pixels_to_mm(pixel_length, px_per_mm_value)` → convert a measurement.
- `measurement_error(expected_mm, measured_mm)` → `MeasurementError` with `absolute_mm`
  and `percent` properties.

## Invariants & domain rules
- Sizes/scales must be > 0; lengths ≥ 0.
- The three calibration **sources** (ArUco, LiDAR/depth, manual caliper) are caller
  responsibility — this module is pure math, no source enforcement, no persistence.
- The release acceptance gate is **mm-accurate** (≤ 0.5 mm), not pixel-accurate — see
  [[model-export-contract]].

## Gotchas / footguns
> [!warning] `percent` divides by `expected_mm`: 0/0 → 0.0, but >0/0 → inf. Guard
> `expected_mm > 0` before trusting `percent` in threshold logic.

> [!warning] No multi-marker/stereo/undistortion support; single-marker reference only.

## Related
- [[model-export-contract]] (calibration contract + acceptance targets)
