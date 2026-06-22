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
