---
project: shared
type: reference
status: active
tags: [drift, contract]
created: 2026-06-22
updated: 2026-06-22
sources: [configs/model_export_contract.json, configs/dataset.advance-seeds-v8.yaml, scripts/export_mobile_model_candidates.py]
canonical: true
---

# Drift register (canonical)

> [!info] Tracked code-vs-doc / contract divergences. Each has a stable ID and a
> `status`. Report drift here; do not silently rewrite either side.

## D-V8-CLASSES — v8 dataset classes diverge from the banana-only contract
- **Status:** open
- The v8 dataset (`configs/dataset.advance-seeds-v8.yaml`) defines 4 classes
  `banana, banana_spot, pepper, watermelon`. The frozen export contract
  (`configs/model_export_contract.json`) and the demo app are **banana-only**.
- **Why it matters:** a model trained on v8 carries classes the app contract doesn't
  declare. Training/registry handle this fine ([[training-to-registry-flow]]); the gap
  is at the *app-shipping* boundary.
- **Resolution path:** a separate coordinated cross-repo change — update the contract
  `class_names`, align the demo app's `SeedAnalyzer` class label/colour map, re-freeze.

## D-EXPORT-CLASSES — frozen contract example vs. derived export class_names
- **Status:** mitigated (code), open (contract doc)
- The export code now derives `class_names` from the trained model
  ([[0001-derive-export-class-names-from-model]]), so metadata is always correct for
  the model. But `model_export_contract.json` still *shows* `[banana, banana_spot]`
  as the frozen example. These diverge for any >2-class model until re-frozen.
- **Resolution path:** re-freeze the contract example as part of D-V8-CLASSES rollout.

## D1 (referenced, cross-repo) — registry metadata vocabulary
- Mentioned in `openspec/changes/align-registry-metadata-strings/proposal.md` as the
  demo repo's `advance-seeds-brain` drift D1 (registry wrote `output_kind:
  segmentation-mask` / `task: segmentation`, outside the contract vocab). Not in this
  vault's scope yet — flagged for a future ingest of the registry callback path.

## Related
- [[model-export-contract]] · [[dataset-pipeline]]
