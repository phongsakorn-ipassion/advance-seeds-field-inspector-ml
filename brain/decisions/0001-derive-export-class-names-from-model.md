---
project: shared
type: decision
status: active
tags: [decision, export, classes]
created: 2026-06-22
updated: 2026-06-22
sources: [scripts/export_mobile_model_candidates.py#L25, openspec/changes/derive-export-class-names-from-model/proposal.md]
canonical: false
---

# ADR: Derive export class_names from the trained model

- **Status:** accepted
- **Date:** 2026-06-22

## Context
Mobile export hardcoded `CLASS_NAMES = ["banana", "banana_spot"]` and stamped it into
every `model-metadata.json`, ignoring what the model was actually trained on. Training
is otherwise fully data-driven ([[training-to-registry-flow]]). With the v8 dataset
adding `pepper`/`watermelon`, this would silently mislabel detections in the app.

Options weighed: read from the trained model's `model.names`; parse the dataset YAML;
or require a `--classes` CLI flag. Chosen: **read from the model** — the weights are
the single source of truth, so the metadata can't disagree with what was learned.

## Decision
Added `resolve_class_names(names, fallback)` (`scripts/export_mobile_model_candidates.py:25`)
— orders a `{index: name}` dict by integer key, passes a list through, falls back when
empty, raises rather than emit empty `class_names`. The call site now uses
`resolve_class_names(model.names, fallback=CLASS_NAMES)`; the constant is fallback-only.
Tracked by OpenSpec change `derive-export-class-names-from-model`.

## Consequences
- Export now supports any number of classes with correct metadata. `output_shape`
  `[1,300,38]` is unchanged — it's class-count-independent under NMS (see
  [[model-export-contract]]).
- The on-device tensor contract and thresholds are untouched.
- **Watch:** shipping a >2-class model to the app is still gated — the frozen contract
  example and the demo app's class handling must be aligned in a separate cross-repo
  change. See [[drift-register]] (D-V8-CLASSES, D-EXPORT-CLASSES).

## Related
- [[mobile-export]] · [[model-export-contract]] · [[drift-register]]
