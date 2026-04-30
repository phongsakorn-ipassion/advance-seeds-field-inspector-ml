# Models

Local exported model artifacts live here. Heavy artifacts are ignored by Git.

Expected mobile handoff filenames:

```text
models/yolo11n-seeds.tflite
models/yolo11n-seeds.mlmodel
models/model-metadata.json
```

The TFLite filename intentionally matches the consuming app's current path,
even if the model architecture is YOLO26n.
