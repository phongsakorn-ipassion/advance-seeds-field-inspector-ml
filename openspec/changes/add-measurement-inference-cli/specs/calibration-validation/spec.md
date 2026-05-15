## ADDED Requirements

### Requirement: Runtime ArUco scale source
The inspector script SHALL provide a runtime ArUco-based scale source that detects a printed fiducial marker each frame and exposes `mm_per_pixel` to downstream measurement and volume estimation. The source SHALL cache the last successful detection and reuse it on frames where the marker is occluded or detection fails.

#### Scenario: Marker present yields scale
- **GIVEN** an ArUco marker with a known physical side length is in the camera frame
- **AND** `scripts/run_segmentation.py` runs with `--scale aruco --marker-size-mm <S>`
- **WHEN** the marker is detected
- **THEN** `mm_per_pixel` SHALL equal `S / mean_marker_side_px`
- **AND** the scale source SHALL be reported as `aruco`

#### Scenario: Marker occluded reuses last scale
- **GIVEN** an ArUco scale source has detected a marker on an earlier frame
- **WHEN** the marker is occluded on the current frame
- **THEN** the scale source SHALL return the most recent successful `mm_per_pixel`
- **AND** the per-instance CSV row SHALL still record that calibration

### Requirement: Per-instance geometric measurement
The inspector script SHALL emit, for every detected mask, pixel-space measurements covering axis-aligned bounding box, rotated minimum-area rectangle length and width, raster area, polygon perimeter, aspect ratio, and circularity. When a scale source is active, the script SHALL additionally emit the same measurements in millimetres or square millimetres.

#### Scenario: Pixel measurement without scale
- **GIVEN** `scripts/run_segmentation.py` runs with `--measure --scale none`
- **WHEN** an instance is detected
- **THEN** the CSV row SHALL include `aabb_w_px`, `aabb_h_px`, `length_px`, `width_px`, `area_px`, `perimeter_px`, `aspect_ratio`, and `circularity`
- **AND** the millimetre columns SHALL be empty
- **AND** `scale_source` SHALL be `none`

#### Scenario: Millimetre measurement under active scale
- **GIVEN** `scripts/run_segmentation.py` runs with `--measure --scale aruco`
- **AND** the marker is detected
- **WHEN** an instance is detected
- **THEN** the CSV row SHALL include `length_mm`, `width_mm`, `area_mm2`, and `perimeter_mm` derived from the active `mm_per_pixel`

#### Scenario: Rotated length is stable across orientation
- **GIVEN** the same elongated object rotates through 90° across consecutive frames
- **WHEN** rotated min-area rect measurements are emitted
- **THEN** `length_px` SHALL be the longer side and `width_px` the shorter side regardless of the object's angle

### Requirement: Class-config-driven volume and weight estimation
The inspector script SHALL estimate per-instance volume in millilitres and weight in grams using a YAML configuration that maps class names to a shape model (`spherical`, `oblong`, or `skip`) and a material density in grams per millilitre. The script SHALL NOT hardcode any class name; all class-specific behaviour SHALL live in configuration. Unmapped classes SHALL fall through to a `defaults` entry.

#### Scenario: Mapped class with active scale produces volume and weight
- **GIVEN** `configs/volume.example.yaml` maps a class `X` to `shape: oblong` with `density_g_per_ml: D`
- **AND** an ArUco or manual scale is active
- **WHEN** an instance of class `X` is detected
- **THEN** the CSV row SHALL include `shape_model = oblong`, a positive `volume_ml`, and `weight_g = volume_ml * D`

#### Scenario: Unmapped class falls through to defaults
- **GIVEN** the volume config sets `defaults.shape: skip`
- **WHEN** an instance of a class not listed under `classes:` is detected
- **THEN** the row SHALL contain measurement columns but SHALL leave `volume_ml`, `weight_g`, `shape_model`, and `density_g_per_ml` empty

#### Scenario: Volume estimation requires a scale
- **GIVEN** a volume config is provided
- **AND** `--scale none` is active
- **WHEN** an instance of a mapped class is detected
- **THEN** the row SHALL leave `volume_ml` and `weight_g` empty
- **AND** measurement columns SHALL still be populated in pixels

#### Scenario: Spherical estimator uses area-equivalent sphere
- **GIVEN** a class is mapped to `shape: spherical`
- **AND** the mask silhouette has area `A` in mm²
- **WHEN** volume is estimated
- **THEN** `volume_ml` SHALL equal `(4/3) * π * (sqrt(A/π))^3 / 1000` multiplied by the configured `finagling_factor`

#### Scenario: Oblong estimator uses PCA-rotated disk method
- **GIVEN** a class is mapped to `shape: oblong`
- **WHEN** volume is estimated
- **THEN** the mask SHALL be PCA-aligned along its long axis and rotated so the axis is horizontal
- **AND** `volume_ml` SHALL equal `Σ π * r(x)² * dx / 1000` summed over each mask column, where `r(x)` is half the visible diameter at column `x` and `dx = 1 / pixels_per_mm`
