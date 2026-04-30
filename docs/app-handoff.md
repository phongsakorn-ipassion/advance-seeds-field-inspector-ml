# App Handoff

The ML repo exports artifacts for:

```text
/Users/ppungpong/Github/advance-seeds-field-inspector-demo/apps/mobile/assets/models/
```

## Files

| Source in this repo | Destination in app repo |
| --- | --- |
| `models/yolo11n-seeds.tflite` | `apps/mobile/assets/models/yolo11n-seeds.tflite` |
| `models/model-metadata.json` | `apps/mobile/assets/models/model-metadata.json` |

The TFLite file is a YOLO26n-seg export copied into the app's historical
`yolo11n-seeds.tflite` filename. Do not infer the architecture from that
filename; use `model-metadata.json` fields `model_name` and `source_weights`.

Core ML artifacts are currently handled by the app's `coreml-runner` Expo
module. If the app switches to loading model files directly from
`assets/models`, add the Core ML destination to `scripts/export_to_demo.py`.

## Metadata Contract

`model-metadata.json` records:

- model name and version
- source weights (`yolo26n-seg.pt` by default)
- app-compatible mobile TFLite filename
- task type
- input size
- class names
- output kind and output shape
- score / IoU thresholds
- calibration requirement and supported calibration sources
- acceptance targets

This metadata is intentionally app-facing. Training-only details such as run
IDs, optimizer settings, and experiment notes should live in training reports,
not in this contract file.
