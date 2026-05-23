## ADDED Requirements

### Requirement: Configurable NMS parameters in mobile export

The training pipeline SHALL forward `max_det`, `iou`, and `conf` from
`run.config_yaml.exportOptions` into Ultralytics' `model.export(format="coreml"|"tflite", nms=True, max_det=..., iou=..., conf=...)`.

#### Scenario: Operator-configured max_det reaches Ultralytics

- **GIVEN** a run row has `exportOptions.ios.nms.maxDet=200`
- **WHEN** the Colab worker runs `train_for_run.py::export_kwargs("coreml", config, ...)`
- **THEN** the returned dict contains `nms=True`, `max_det=200`,
  `iou=0.7`, `conf=0.25`.

#### Scenario: Missing exportOptions falls back to defaults

- **GIVEN** a legacy run row without `exportOptions.nms`
- **WHEN** the worker resolves export kwargs
- **THEN** the returned dict contains `max_det=300`, `iou=0.7`,
  `conf=0.25`.
