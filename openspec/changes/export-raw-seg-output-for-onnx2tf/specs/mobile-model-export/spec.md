## MODIFIED Requirements

### Requirement: App-facing metadata
Every mobile export SHALL include `model-metadata.json` with model name, version,
source weights, mobile TFLite filename, task, input size, class names, output
kind, output shape, NMS-applied flag, mask-prototype shape (for segmentation),
thresholds, calibration contract, and acceptance targets.

Because the only `onnx2tf`-convertible YOLO26-seg head is the one-to-many head,
exports SHALL declare `output_kind` as `segmentation_raw` with `nms_applied:
false`, an `output_shape` of `[1, 4 + num_classes + 32, anchors]` derived from
the trained class count (anchors = 8400 at input size 640), and a
`mask_proto_shape` (e.g. `[1, 32, 160, 160]`). The app runs NMS and mask
assembly on these raw tensors. The `nms_applied` and `mask_proto_shape` fields
SHALL be optional and backward compatible: metadata written before this change
(lacking them) loads with `nms_applied` defaulting to `true` and
`mask_proto_shape` to `null`.

#### Scenario: Metadata generation includes calibration contract
- **WHEN** `scripts/write_model_metadata.py` writes metadata
- **THEN** the JSON contains supported calibration sources and default marker size

#### Scenario: Metadata declares raw segmentation output
- **WHEN** metadata is generated with default arguments for a segmentation model
- **THEN** `source_weights` is `yolo26n-seg.pt`
- **AND** `output_kind` is `segmentation_raw`
- **AND** `nms_applied` is `false`
- **AND** `mask_proto_shape` is present

#### Scenario: Output shape is derived from the class count
- **WHEN** metadata is generated for a model with N classes at input size 640
- **THEN** `output_shape` is `[1, 4 + N + 32, 8400]`
- **AND** for the 5-class seeds model that is `[1, 41, 8400]`

#### Scenario: Legacy metadata without the new fields still loads
- **WHEN** a `model-metadata.json` written before this change (no `nms_applied`
  or `mask_proto_shape`) is loaded
- **THEN** it loads successfully with `nms_applied` defaulting to `true`
- **AND** `mask_proto_shape` defaulting to `null`
