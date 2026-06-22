## 1. Derive export class names from the model

- [x] 1.1 Add `resolve_class_names(names, fallback)` to `scripts/export_mobile_model_candidates.py`: order a `{index: name}` dict by integer key, pass a list through, fall back when empty, raise `ValueError` when empty with no fallback.
- [x] 1.2 Replace `class_names=CLASS_NAMES` at the metadata call site with `class_names=resolve_class_names(model.names, fallback=CLASS_NAMES)`.
- [x] 1.3 Keep `CLASS_NAMES` only as a documented fallback constant.

## 2. Tests

- [x] 2.1 Add `tests/test_export_class_names.py` covering dict ordering, list passthrough, fallback, and empty-raises.
- [x] 2.2 `python3 -m unittest discover -s tests` is green (74 tests).

## 3. Validate

- [x] 3.1 `openspec validate derive-export-class-names-from-model --strict`.

## 4. Follow-up (separate change — NOT in scope here)

- [ ] 4.1 When releasing a >2-class model to the app: update `configs/model_export_contract.json` `class_names`, align the demo app's `SeedAnalyzer` class label/colour mapping, and re-freeze the contract via a coordinated cross-repo change.
