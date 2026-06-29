---
project: shared
type: reference
status: active
tags: [drift, contract]
created: 2026-06-22
updated: 2026-06-23
sources: [configs/model_export_contract.json, configs/dataset.advance-seeds-v8.yaml, scripts/export_mobile_model_candidates.py, supabase/migrations/20260521000002_versions_tflite_nullable.sql, scripts/train_for_run.py]
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

## D1 — registry metadata vocabulary (in-flight OpenSpec change)
- **Status:** open (tracked by OpenSpec `align-registry-metadata-strings`)
- The registry/callback path and some example/test metadata use `output_kind:
  segmentation-mask` / `task: segmentation`, **outside** the contract vocab
  (`output_kind: segmentation`, `task: instance-segmentation`; see
  [[model-export-contract]]). Today nothing breaks only because the app overwrites these
  with hardcoded values. Feeds [[compat-signature]] — changing these strings changes the
  signature → `rebuild_required`.
- **Resolution path:** the `align-registry-metadata-strings` change (emit contract vocab
  from `training-callback`; remove the app's silent overwrite; coordinate the cutover).
  See [[edge-functions]].

## D-CLOUD-MIGRATION-DRIFT — cloud registry DB lags repo migrations
- **Status:** open (needs `supabase db push` to the cloud project)
- The repo migration `20260521000002_versions_tflite_nullable.sql` drops
  `NOT NULL` from `versions.tflite_r2_key`, and [[model-registry-db]] documents the
  column as nullable. **Cloud reality diverges:** on 2026-06-23 a Colab run whose TFLite
  export failed sent `tflite_r2_key=null` and `create_version` got `HTTP 400` — the
  cloud DB still enforces `NOT NULL` because the migration was never pushed there.
- **Why it matters:** any CoreML/PyTorch-only run (TFLite disabled or failed) cannot
  record a version until cloud catches up. Migrations auto-apply only to the *local*
  `supabase db reset` stack; the cloud project needs an explicit push.
- **Resolution path:** `supabase db push` to `advance-seeds-model-registry`, or run the
  idempotent DDL in the SQL editor:
  `alter table public.versions alter column tflite_r2_key drop not null;`
  Then re-verify with `information_schema.columns`. After a 400, check the touched column
  in cloud before assuming an SDK bug ([[python-registry-sdk]] now surfaces the PostgREST
  reason in the error).

## D-TFLITE-ONNX2TF — YOLO26-seg end2end export to TFLite is unstable
- **Status:** fix applied, pending GPU/Colab verification (was: open)
- The Colab/worker export path repeatedly fails converting the YOLO26-seg **end2end**
  head through `onnx2tf` (1.28.8), with a *different* error each run (e.g.
  `UnboundLocalError: dummy_tensor` on `model.23/Mul_3`; `CUDA_ERROR_INVALID_HANDLE` on
  `model.2/Slice`; `ValueError: Dimension 1 ... 300 and 32` on `model.23/Concat_6`,
  the mask-coeff branch laid out as `[1,32,300]` instead of `[1,300,32]`). `nms=True`
  is forced off for end2end models. CoreML and PyTorch exports from the same `best.pt`
  succeed.
- **Why it matters:** the frozen [[model-export-contract]] still lists
  `yolo11n-seeds.tflite` as required for the Android app, but runs currently produce no
  `.tflite`. This is the upstream cause of the null `tflite_r2_key` in
  D-CLOUD-MIGRATION-DRIFT. `train_for_run.py` tolerates a failed export (records
  `precision: "failed"`, still creates the version) — see [[training-driver]].
- **Root cause (2026-06-29):** YOLO26 ships a dual-head architecture. The default
  **one-to-one (end2end) head** is NMS-free and bakes post-processing into `model.23`;
  `onnx2tf` cannot convert that graph. Switching to the **one-to-many head**
  (`end2end=False`) makes `nms=True` apply at export, producing the *classic* seg head
  `onnx2tf` already handles — while keeping the `[1,300,38]` NMS-applied output, so the
  contract is unchanged and the app still runs no NMS.
- **Fix applied:** `export_kwargs` (train_for_run.py) and `export_mobile_model_candidates.py`
  now pass `end2end=False` alongside `nms=True` for both tflite and coreml. Belt-and-
  suspenders: `pyproject.toml` `[train]` pins `onnx2tf>=1.26.3,<1.28.8` so AutoUpdate
  can't pull the broken 1.28.8. Verify on the next Colab/Modal run that a `.tflite`
  artifact lands and `tflite_r2_key` is non-null.

## D-CHANNEL-DUAL — two ways to track the deployed version
- **Status:** open (legacy field retained)
- `channels.current_version_id` (legacy) and `channel_deployments` (current) both encode
  "what's deployed"; `resolve-channel` still reads the legacy field in places. If they
  diverge, mobile can resolve a stale version. Read from `channel_deployments`.
- See [[model-registry-db]], [[web-dashboard]].

## Related
- [[model-export-contract]] · [[compat-signature]] · [[dataset-pipeline]]
- [[model-registry-db]] · [[edge-functions]]
