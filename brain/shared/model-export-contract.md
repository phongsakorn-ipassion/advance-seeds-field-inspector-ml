---
project: shared
type: contract
status: active
tags: [contract, export, mobile]
created: 2026-06-22
updated: 2026-06-22
sources: [configs/model_export_contract.json, src/advance_seeds_ml/contracts.py#L31-L96, scripts/export_mobile_model_candidates.py#L130-L144]
canonical: true
---

# Model Export Contract (canonical)

> [!info] Canonical home — source of truth for what the demo app expects from an
> exported model. Other pages link here; they don't restate it.

## The contract

Frozen template: `configs/model_export_contract.json`. Enforced in code by the
`ModelMetadata` dataclass at `src/advance_seeds_ml/contracts.py:31`.

| Field | Value (frozen) | Why it matters |
| --- | --- | --- |
| `model_name` | `yolo26n-seg` | recorded in metadata |
| `task` | `instance-segmentation` | app `SeedAnalyzer` is segmentation-shaped |
| `input_size` | `640` | app preprocesses to this |
| `mobile_tflite_filename` | **`yolo11n-seeds.tflite`** | **frozen alias** — the app loads by this exact name. Ships YOLO26n-seg weights despite the `yolo11n` name. |
| `output_kind` | `segmentation` | export runs `nms=True`; app does no external NMS |
| `output_shape` | `[1, 300, 38]` | top-300 detections × 38 features |
| `score_threshold` / `iou_threshold` | `0.35` / `0.6` | defaults |
| `calibration.supported_sources` | `aruco, lidar, manual` | app supports exactly these three |
| `class_names` | `[banana, banana_spot]` | the frozen *example*; see footgun below |

## Why output_shape is class-count-independent

> [!check] Adding classes does NOT change `output_shape`.
> Because export runs `nms=True` (`scripts/export_mobile_model_candidates.py:112`),
> each of the 300 rows is `[x1,y1,x2,y2, score, class_id, ...32 mask coeffs] = 38`.
> `class_id` is a **single integer index**, not a one-hot vector — so 2 classes or
> 40 classes, the tensor stays 38 wide. The app indexes its name list by `class_id`.

## Producers and consumers

- **Producer:** `scripts/export_mobile_model_candidates.py` (writes `model-metadata.json`
  per candidate) and `scripts/write_model_metadata.py` (standalone, `--classes` required).
- **Validator:** `ModelMetadata.validate()` (`contracts.py:53`) — rejects empty
  `class_names`, bad thresholds, non-positive `output_shape` dims, unknown `task`.
- **Consumer:** the demo app (`advance-seeds-field-inspector-demo`) — reads
  `class_names` to label detections; parses the fixed 38-wide tensor.

## Invariants & footguns

> [!warning] `class_names` in the frozen JSON is banana-only, but the export code now
> derives the real list from the trained model — see [[0001-derive-export-class-names-from-model]].
> The JSON example and a >2-class trained model can diverge until the contract is
> re-frozen. Tracked in [[drift-register]] (D-EXPORT-CLASSES).

> [!warning] Never rename `yolo11n-seeds.tflite` unilaterally — the app's
> `TfliteSeedAnalyzer` loads by that exact filename. Renaming requires a lockstep
> app change.

- The acceptance gate is **mm-accurate, not pixel-accurate**: seg mAP ≥ 0.85,
  mask mAP ≥ 0.80, measurement error ≤ 0.5 mm.

## Related
- [[mobile-export]] — how the export script produces artifacts
- [[training-to-registry-flow]] — how classes reach the model in the first place
- [[dataset-pipeline]] — where classes are defined
- [[drift-register]]
