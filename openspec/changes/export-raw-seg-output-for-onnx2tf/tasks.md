# Tasks

## 1. Contract model
- [x] Add `segmentation_raw` to `OutputKind`.
- [x] Add `nms_applied` (default True) and `mask_proto_shape` (default None) to `ModelMetadata` + validate.
- [x] Add `raw_seg_output_shape(num_classes, imgsz)` and `MASK_PROTO_SHAPE` helpers.

## 2. Metadata generation
- [x] `write_model_metadata.py`: default `output_kind=segmentation_raw`, derive `output_shape`, set `nms_applied=False`, `mask_proto_shape`.
- [x] `export_mobile_model_candidates.py`: emit raw-seg metadata derived from `model.names`.
- [x] `train_for_run.py::build_version_metadata`: add `output_shape`, `output_kind=segmentation_raw`, `nms_applied=False`, `mask_proto_shape` so the registry version the app reads is correct.

## 3. Frozen contract
- [x] Update `configs/model_export_contract.json` to the raw-seg contract.

## 4. Tests + validation
- [x] Contract tests for `raw_seg_output_shape`, segmentation_raw round-trip, legacy back-compat.
- [ ] `openspec validate --all --strict`
- [ ] `python3 -m unittest discover -s tests`
