# Models

Local exported model artifacts live here. Heavy artifacts are ignored by Git.

Expected mobile handoff filenames:

```text
models/yolo11n-seeds.tflite
models/yolo11n-seeds.mlmodel
models/model-metadata.json
```

The selected source model is Ultralytics YOLO26n-seg (`yolo26n-seg.pt`). The
TFLite filename intentionally matches the consuming app's current path:
`yolo11n-seeds.tflite`. Treat that as a compatibility alias, not the model
architecture.
