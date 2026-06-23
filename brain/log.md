# Log (append-only)

Prefix entries `## [YYYY-MM-DD] <mode> | <scope>` so `grep "^## \[" log.md | tail` works.

## [2026-06-22] ingest | full ml-repo (registry, edge fns, web, training, worker, SDK, calibration)

**Mode:** ingest (full ml-repo sweep). Dispatched 4 read-only research agents in parallel
(registry DB+storage; edge functions; web dashboard; training+calibration+worker+SDK),
each returning a cited fact-sheet; wrote pages from those.

**Pages written:** `ml-repo/architecture` (resolves the prior dangling link);
`ml-repo/document/{model-registry-db, edge-functions, web-dashboard, training-driver,
training-worker, python-registry-sdk, calibration}`; `shared/compat-signature` (new
canonical contract). Updated `shared/drift-register` (D1 detail, new D-CHANNEL-DUAL) and
`index`. Vault now 23 pages; link lint clean.

**Key findings / non-obvious truths captured:**
- [[compat-signature]] is computed in TWO places (Postgres trigger + `_shared/compat.ts`)
  that must produce byte-identical canonical JSON; adding a class flips it → all clients
  get `rebuild_required`. Made it a canonical page.
- D1: registry/callback metadata uses `segmentation-mask`/`segmentation` vocab outside the
  contract; only survives because the app overwrites it. Tracked by in-flight OpenSpec
  `align-registry-metadata-strings`.
- D-CHANNEL-DUAL: `channels.current_version_id` (legacy) vs `channel_deployments` (current).
- Hosted training is a manual Colab hand-off; runs sit `running` until flagged stalled (>1h).
- Per-platform quantization lives only in the Colab `train_for_run.py` path — the local
  entry point and the Modal worker use Ultralytics export defaults (FP32).
- `tflite_r2_key` is nullable; the "min one platform" export constraint was dropped.

**Also this turn:** pushed branch `feat/v8-dataset-and-class-agnostic-export`; opened PR #4.

## [2026-06-22] init | bootstrap (seed scope) + this session's work

**Mode:** init (seed, not full ingest). Vault created at `brain/` in the ml repo.

**Sources read (this session):**
- `src/advance_seeds_ml/dataset.py`, `scripts/validate_dataset.py`, `data/README.md`
- `configs/model_export_contract.json`, `src/advance_seeds_ml/contracts.py`,
  `tests/test_contracts.py`
- `scripts/export_mobile_model_candidates.py`, `scripts/write_model_metadata.py`
- class-flow trace across `apps/web/src/App.tsx`, `supabase/functions/start-training`,
  `scripts/train_for_run.py`, `notebooks/train_run.ipynb`, `training-callback`
- the Roboflow v8 export (`advance-seeds-field-inspector.v8-dataset-v2.yolo26`)

**Pages written:** CLAUDE, README, index, log, 3 templates;
`ml-repo/{overview, document/dataset-pipeline, document/mobile-export, document/training-to-registry-flow}`;
`shared/{model-export-contract (canonical), drift-register (canonical)}`;
`decisions/0001-derive-export-class-names-from-model`; bundled sync skill.

**Work done this session (reflected in pages):**
- Restructured the Roboflow v8 dataset (4 classes: banana, banana_spot, pepper,
  watermelon; 2457 imgs) split-first → type-first into `data/processed/advance-seeds-v8/`;
  added `configs/dataset.advance-seeds-v8.yaml`; validator → `ok`. Fixed a `banana_ spot`
  typo and dropped one malformed 2-point label row.
- Made mobile export class-agnostic: `resolve_class_names()` reads `model.names`
  (ADR 0001 / OpenSpec `derive-export-class-names-from-model`). Suite 70 → 74 green.
- Committed on branch `feat/v8-dataset-and-class-agnostic-export` (2 commits).

**Key findings / non-obvious truths captured:**
- `output_shape [1,300,38]` is class-count-independent because export runs `nms=True`
  (class_id is a single integer). Adding classes does not break the tensor contract.
- Training/registry are fully data-driven for classes; export was the only hardcoded spot.
- Drift: v8 classes vs banana-only contract/app (D-V8-CLASSES, D-EXPORT-CLASSES).
- The export module keeps `import ultralytics` inside the function so tests run CPU-only.

## [2026-06-23] ingest | registry SDK hardening (NaN-safe JSON, surfaced errors) + Colab Step-5 drift

**Mode:** ingest. Source of truth: code merged to `main` (PR #6 `8e79a4bc`, PR #7 `9af39393`)
+ two Colab Step-5 run logs. Confirmed every claim against `src/advance_seeds_ml/registry/client.py`.

**Pages written:** `ml-repo/document/python-registry-sdk` (two new invariants + a 400-is-a-
backend-problem footgun); `shared/drift-register` (new D-CLOUD-MIGRATION-DRIFT, D-TFLITE-ONNX2TF);
`ml-repo/document/model-registry-db` (cloud-lags-repo warning on the nullable migration).

**Work done this session (reflected in pages):**
- `urllib_transport` now catches `HTTPError` and raises `RegistryError` with the PostgREST
  body (host stripped so the service-role key can't leak) — `client.py:219`. Previously a
  bare "HTTP 400" with the body discarded, making registry failures undiagnosable.
- `_json` now runs `_sanitize_json` (`client.py:190`,`236`): recursively coerces
  `NaN`/`±Infinity` → `null`. Fixes `log_metrics` `PGRST102 "Empty or invalid json"` caused
  by NaN training metrics serialized as bare `NaN` tokens (invalid JSON). Suite 79 → 81 green.

**Key findings / non-obvious truths captured:**
- Two Step-5 failures, one root cause class each: (1) NaN-in-JSON → PGRST102 (fixed in code);
  (2) `create_version` 400 = cloud DB still enforces `tflite_r2_key NOT NULL` despite repo
  migration `20260521000002` → **D-CLOUD-MIGRATION-DRIFT** (needs `supabase db push`).
- The error-surfacing fix paid off immediately: it exposed the PGRST102 reason in one run
  instead of another GPU cycle of guessing — observability at the boundary compounds.
- TFLite export keeps failing through `onnx2tf` on the YOLO26-seg end2end head (different
  error each run) → **D-TFLITE-ONNX2TF**; this is why `tflite_r2_key` is null. CoreML +
  PyTorch still export fine. Android export deferred by decision.
- Training itself is healthy: 50-epoch run hit seg mAP50 0.762 (banana 0.962, watermelon
  0.943, pepper 0.753; banana_spot weak at 0.389 — a data/class problem, not a pipeline bug).
