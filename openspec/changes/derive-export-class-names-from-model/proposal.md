## Why

The mobile export pipeline hardcoded the class list. `scripts/export_mobile_model_candidates.py` carried `CLASS_NAMES = ["banana", "banana_spot"]` and stamped it into every `model-metadata.json`, regardless of what the model was actually trained on.

This caps the otherwise data-driven pipeline at two classes. Training is already class-agnostic: the web dashboard parses classes from the dataset YAML's `names:` block, stores them on the run, and Ultralytics reads them straight from the YAML on Colab/Modal. But export ignored all of that and re-asserted banana/banana_spot — so a model trained on the new Roboflow **v8** dataset (`banana, banana_spot, pepper, watermelon`) would export `model-metadata.json` with the **wrong** class names, silently mislabelling pepper/watermelon detections as banana in the field app.

The export tensor contract is unaffected by class count: because export runs `nms=True`, each of the 300 detection rows is `[x1,y1,x2,y2, score, class_id, ...32 mask coeffs] = 38` features, where `class_id` is a single integer index — so `output_shape: [1,300,38]` is class-count-independent and stays frozen.

## What Changes

- `scripts/export_mobile_model_candidates.py` SHALL derive `class_names` from the trained model's own `model.names` (the single source of truth — the weights), ordered by class index, instead of a hardcoded constant. The former constant is retained only as a fallback for a model that ships without names.
- A `resolve_class_names()` helper SHALL turn `model.names` (a `{index: name}` dict, key-order not guaranteed) into an index-ordered list, fall back when empty, and raise rather than emit an empty class list (which would fail `ModelMetadata.validate()`).

Non-goals:

- Do **not** change `output_shape` (`[1, 300, 38]`) — it is class-count-independent under NMS and remains frozen.
- Do **not** change the frozen `configs/model_export_contract.json` `class_names` example, nor ship a >2-class model to the app, in this change. Releasing pepper/watermelon to the field app is a separate, deliberate cutover that must align the demo app's class handling (its `SeedAnalyzer` label/colour mapping) in lockstep — tracked as its own cross-repo change.
- Do not change training, dataset, or web-dashboard logic — they are already data-driven.

## Capabilities

### Modified Capabilities

- `mobile-model-export`: exported `model-metadata.json` `class_names` MUST reflect the classes the model was actually trained on (derived from the model), not a hardcoded banana-only list.

## Impact

- `scripts/export_mobile_model_candidates.py` — new `resolve_class_names()` helper; metadata `class_names` now derived from `model.names`.
- `tests/test_export_class_names.py` — new unit tests for the helper (ordering, list passthrough, fallback, empty-raises).
- No change to the on-device tensor contract (`output_shape`, `output_kind`), thresholds, or calibration.
- **App-shipping is still gated:** the frozen contract and the demo app's class handling are unchanged; a multi-class release remains a separate coordinated change.
