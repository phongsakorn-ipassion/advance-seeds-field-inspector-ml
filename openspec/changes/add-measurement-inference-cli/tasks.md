## 1. OpenSpec

- [x] 1.1 Add proposal, design, tasks, and `calibration-validation` delta.
- [ ] 1.2 Update canonical `calibration-validation` spec after implementation.

## 2. Scale Provider

- [x] 2.1 Add `ScaleResult` dataclass and `NoneScaleProvider`, `ManualScaleProvider`, `ArucoScaleProvider` classes.
- [x] 2.2 Wire `--scale`, `--mm-per-pixel`, `--marker-size-mm`, `--aruco-dict`, `--aruco-stride` CLI flags.
- [x] 2.3 Detect ArUco markers with `cv2.aruco.ArucoDetector` and compute `mm_per_pixel` from mean side length.
- [x] 2.4 Cache the last detected scale across occluded frames; expose `last()` for stride-based callers.

## 3. Geometric Measurement

- [x] 3.1 Add `measure_instance(polygon, mask_bool, scale, cv2, np)` covering AABB, rotated rect, raster area, perimeter, aspect ratio, circularity.
- [x] 3.2 Emit both pixel and millimeter columns when scale is available.
- [x] 3.3 Add `--measure`, `--measure-mode`, and `--measure-csv` CLI flags; route stream and live paths through the same measurement pass.
- [x] 3.4 Add `MeasurementCsvWriter` with a stable column header.

## 4. Volume and Weight Estimation

- [x] 4.1 Add `_shape_spherical` (area-equivalent sphere).
- [x] 4.2 Add `_shape_oblong` (PCA + vectorized disk method) operating on the rasterized polygon.
- [x] 4.3 Add `estimate_volume(polygon, class_name, scale, volume_config, cv2, np)` dispatcher with `defaults.shape: skip` fallback for unmapped classes.
- [x] 4.4 Add `--volume-config` CLI flag; implies `--measure`.
- [x] 4.5 Ship `configs/volume.example.yaml` with shape/density/finagling-factor schema.
- [x] 4.6 Append volume and weight columns to the CSV header; render `V=...mL W=...g` on the live overlay label.

## 5. Inference Throughput

- [x] 5.1 Auto-pick device: MPS on Apple Silicon, CUDA when available, CPU otherwise; respect `--cpu` override.
- [x] 5.2 Add `--half` flag for fp16 on MPS/CUDA; warn and disable on CPU.
- [x] 5.3 Add `ThreadedCapture` with always-latest-frame semantics; replace direct `cv2.VideoCapture` in the live loop.
- [x] 5.4 Cache class colors in a module-level LUT to remove per-polygon RNG allocation.
- [x] 5.5 Throttle ArUco detection via `--aruco-stride` and stdout via `--log-every`.

## 6. Validation

- [x] 6.1 Smoke-test `_shape_spherical` and `_shape_oblong` against analytical references (sphere V=523.6 mL @ R=50 mm; ellipsoid of revolution V≈47 mL for 100×30 mm).
- [x] 6.2 Verify CLI surface via `--help` and confirm new flags are documented.
- [x] 6.3 Verify ArUco runtime available on installed OpenCV (`hasattr(cv2.aruco, "ArucoDetector")`).
- [ ] 6.4 Run `openspec validate --all --strict`.
- [ ] 6.5 Update canonical `calibration-validation` spec with the runtime-scale, measurement, and volume requirements.
