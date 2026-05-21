# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Audience:** a new engineer taking over the **ML / training / model-registry** side of the Advance Seeds Field Inspector project. The sibling demo app (Expo + Supabase) has its own `CLAUDE.md`. Read this end-to-end before training or shipping a model.

## What this repo is

Everything that produces, evaluates, registers, and ships **on-device fruit/seed segmentation models** for the demo app. Concretely the repo owns:

1. **Dataset prep + validation** for YOLO-segmentation layouts (PoC classes: Apple, Apple Spot, Banana, Banana Spot, Orange, Orange Spot — current export contract is banana-only, see below).
2. **Training** with Ultralytics **YOLO26n-seg** (`yolo26n-seg.pt`) — both local CLI scripts and a hosted training worker on Modal.
3. **Calibration validation** in pixel-vs-mm (ArUco + LiDAR + manual caliper paths).
4. **Mobile export**: TFLite for Android, Core ML for iOS, plus `model-metadata.json`.
5. **Model Registry** — Supabase Postgres + RLS + Edge Functions + Cloudflare R2 storage, with a Vite + React **web dashboard** for browsing runs/versions/channels.
6. **Hosted training trigger** — a Python worker (Modal) launched from a Supabase Edge Function (`start-training`) and reporting back via `training-callback`.
7. **`export_to_demo.py`** — copies the right artifacts into the demo repo's `apps/mobile/assets/models/`.

The contract with the app is the artifact set in `configs/model_export_contract.json`. **Do not break it without an OpenSpec change touching both repos.**

## Tech stack at a glance

| Layer            | Stack                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Training         | Python ≥ 3.10 · Ultralytics 8.3+ (YOLO26n-seg) · OpenCV · NumPy · PyTorch                    |
| Hosted training  | Modal · FastAPI (callback HTTP) · invoked from a Supabase Edge Function                      |
| Mobile export    | TFLite (Android) · Core ML / `coremltools` (iOS) · NMS-free end-to-end head                  |
| Calibration      | ArUco markers (`px_per_mm`), LiDAR depth (app-side runtime), known-caliper reference         |
| Registry DB      | Supabase (Postgres + RLS + Realtime + Auth) — shared with the demo app                       |
| Registry storage | Cloudflare R2 (S3-compatible) — bucket `advance-seeds-models`, browser-issued presigned URLs |
| Registry API     | Supabase Edge Functions (Deno) under `supabase/functions/`                                   |
| Registry web UI  | React 19 + Vite 6 + Vitest + TypeScript, in `apps/web/`                                      |
| Python SDK       | `packages/registry/` (Python) for talking to the registry from training                      |
| Tests            | stdlib `unittest` (no pytest) for the Python side; Vitest for the web app                    |
| Notebooks        | Jupyter — `notebooks/train_run.ipynb` for local Colab-style training                         |
| Spec workflow    | OpenSpec (`openspec/`) — Codex skills under `.codex/skills/`                                 |

## Repo layout

```text
src/advance_seeds_ml/             Python package (importable)
  calibration.py                  px_per_mm + measurement-error helpers
  contracts.py                    Model metadata contract helpers
  dataset.py                      YOLO-seg dataset validation
  banana_dataset.py               Banana dataset prep (current PoC)
  training.py                     Training driver (used by scripts + worker)
scripts/                          Operator-facing entrypoints
  validate_dataset.py             Validate labels + split coverage (no train deps)
  write_model_metadata.py         Emit the app-facing model-metadata.json
  export_mobile_model_candidates.py  Export Android TFLite + iOS Core ML candidates
  export_to_demo.py               Copy artifacts into the demo repo's assets/models/
  prepare_banana_dataset.py       PoC banana data prep
  train_yolo26n_seg.py            Local training entry
  train_for_run.py                Training driver bound to a registry run row
  run_segmentation.py             End-to-end seg inference / eval CLI
  backfill_pytorch_artifact.py    Backfill historic registry runs with .pt artifacts
  evaluate_model_summary.py       Aggregate eval metrics into a JSON summary
  train_local_banana.sh           Shell wrapper for local banana training
configs/
  dataset.example.yaml            Example YOLO-seg dataset config
  model_export_contract.json      ← frozen contract with the demo app (read this!)
data/                             Datasets (gitignored content; README describes layout)
models/                           Local exports (gitignored content)
notebooks/
  train_run.ipynb                 Colab-style training notebook
tests/                            stdlib unittest suite for the Python package
apps/
  web/                            React 19 + Vite registry dashboard
    src/                          UI (list runs, versions, channels, deployments)
    package.json                  scripts: dev / build / preview / test (vitest)
packages/
  training-worker/                Hosted training worker (Modal)
    src/                          worker entrypoints
    pyproject.toml                installable; `[modal]` extra adds modal + fastapi
supabase/
  config.toml                     Supabase project config
  migrations/                     Registry schema migrations (model_lines, runs, versions, channels, RLS, …)
  functions/                      Edge Functions (Deno):
    _shared/                      shared helpers (auth, R2 presigning)
    start-training                kick off a training job (calls Modal)
    training-callback             Modal → Supabase: write metrics + artifacts
    upload-artifact / download-artifact   R2 presigned URLs
    upload-dataset / download-dataset / delete-dataset   R2 presigned URLs
    list-deployed-models          resolve channel → version → artifact for the app
    resolve-channel               channel pointer resolution
    storage-usage                 quota reporting
  tests/  fixtures/               Edge Function tests + fixtures
  .env.example                    SUPABASE + R2 secrets template
infra/
  r2-cors.json                    Cloudflare R2 CORS policy (apply via `wrangler r2 …`)
docs/
  app-handoff.md                  How outputs move into the demo app
  dynamic-model-loading-handoff.md  App-side plan for browse/download-model UX
openspec/
  config.yaml                     OpenSpec rules
  specs/                          Canonical specs (project-governance, dataset-preparation,
                                  segmentation-training, calibration-validation, mobile-model-export,
                                  model-registry, hosted-training-trigger, model-registry-web-dashboard,
                                  training-worker, python-registry-sdk, …)
  changes/                        In-flight change proposals + tasks
.codex/                           Codex OpenSpec skills (generated)
.mcp.json                         MCP config — Google Colab MCP (uvx + git@googlecolab/colab-mcp)
pyproject.toml                    Top-level Python package (advance-seeds-field-inspector-ml)
```

## Prerequisites

- **Python** ≥ 3.10. A venv is recommended.
- **Supabase CLI** — `brew install supabase/tap/supabase`. Required to run Edge Functions and migrations locally.
- **Deno** is bundled with the Supabase CLI; you don't install it separately.
- **Node 20+** + **pnpm or npm** for `apps/web/` (Vite dashboard).
- **Cloudflare R2** account + access keys for artifact storage (bucket `advance-seeds-models`). Local dev can use `minio` or another S3-compatible mock if R2 is unavailable.
- **Modal** account + CLI (`pip install modal`) for hosted training; **optional** until you actually want to run jobs on GPUs.
- **GPU + CUDA / Apple Silicon MPS** for any real training run. Dataset validation, contract scripts, and the test suite run on CPU.
- **`coremltools`** if you're exporting Core ML; **`tensorflow`** / `tflite` if you're exporting TFLite. These are heavy and live behind the `train` extra.

## Quickstart — Python toolchain

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip
python -m pip install -e .          # scaffold only (PyYAML)
# python -m pip install -e '.[train]'  # add ultralytics, opencv, numpy when training

# Confirm the scaffold works
python -m unittest discover -s tests

# Validate a dataset (no training deps needed)
python scripts/validate_dataset.py configs/dataset.example.yaml

# Run a single test
python -m unittest tests.test_dataset
python -m unittest tests.test_dataset.DatasetTestCase.test_split_coverage
```

## Quickstart — Supabase (registry) locally

```bash
cd supabase
cp .env.example .env.local
# fill in R2_* + (after `supabase start`) the printed anon + service_role keys
supabase start                       # boots Postgres + Studio + Edge runtime
supabase db reset                    # applies all migrations from supabase/migrations
supabase functions serve start-training --env-file .env.local   # or any other function
```

The demo app and this registry **share the same Supabase project** in cloud. Locally they each run their own stack; in cloud they point at one project. Migrations from this repo own the registry tables (`model_lines`, `runs`, `versions`, `channels`, `channel_deployments`, RLS, realtime publication).

## Quickstart — Registry web dashboard

```bash
cd apps/web
pnpm install        # or npm install
pnpm dev            # vite on http://127.0.0.1:5173
pnpm test           # vitest
pnpm build          # tsc -b && vite build
```

The dashboard authenticates against Supabase and resolves R2 artifact URLs through the Edge Functions (`list-deployed-models`, `download-artifact`).

## Quickstart — Hosted training (Modal)

```bash
cd packages/training-worker
python -m pip install -e '.[modal]'
modal token new                      # one-time auth
modal deploy src/...                 # deploy worker (see src/ entrypoints)
```

End-to-end flow:

1. Web dashboard or curl → Supabase Edge Function `start-training` (auth required).
2. Edge function inserts a row in `runs`, hands the run id to Modal.
3. Modal worker pulls the dataset from R2 (presigned URLs), trains YOLO26n-seg, uploads artifacts.
4. Worker calls back into Supabase Edge Function `training-callback` → writes metrics + version row, marks artifact ready.
5. Web dashboard sees updates via Supabase Realtime.
6. App calls `list-deployed-models` for a channel → gets the resolved version + signed R2 URL → downloads to `assets/models/`.

## Quickstart — End-to-end model handoff to the app

```bash
# 1. Train (locally for now)
bash scripts/train_local_banana.sh
# or: python scripts/train_yolo26n_seg.py --config configs/dataset.example.yaml

# 2. Export candidates (TFLite + Core ML) — writes to runs/mobile-exports/
python scripts/export_mobile_model_candidates.py

# 3. Write metadata
python scripts/write_model_metadata.py \
  --model-name yolo26n-seg \
  --model-version 0.1.0 \
  --source-weights yolo26n-seg.pt \
  --input-size 640 \
  --classes apple apple_spot banana banana_spot orange orange_spot \
  --output models/model-metadata.json

# 4. Copy into the demo app
python scripts/export_to_demo.py \
  --tflite models/yolo11n-seeds.tflite \
  --metadata models/model-metadata.json
```

The destination is fixed:

```text
../advance-seeds-field-inspector-demo/apps/mobile/assets/models/
```

## The frozen artifact contract (do not break)

`configs/model_export_contract.json` defines what the app expects:

| Field                               | Value (current)                                             | Why it matters                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `model_name`                        | `yolo26n-seg`                                               | recorded in metadata; can change with an OpenSpec change                                                                       |
| `task`                              | `instance-segmentation`                                     | the app's `SeedAnalyzer` is segmentation-shaped                                                                                |
| `input_size`                        | `640`                                                       | app preprocesses to this size                                                                                                  |
| `mobile_tflite_filename`            | **`yolo11n-seeds.tflite`**                                  | **frozen alias.** The app loads by this exact filename. Renaming requires touching the app's `TfliteSeedAnalyzer` in lockstep. |
| `output_kind`                       | `end2end_nms_free`                                          | export with NMS baked in; the app does not run external NMS                                                                    |
| `output_shape`                      | `[1, 300, 6]`                                               | top-300 detections, 6 features per row                                                                                         |
| `score_threshold` / `iou_threshold` | `0.5` / `0.75`                                              | defaults; can be overridden in `model-metadata.json`                                                                           |
| `calibration.supported_sources`     | `aruco`, `lidar`, `manual`                                  | the app supports these three; don't add a fourth without aligning the runtime                                                  |
| `acceptance_targets`                | seg mAP ≥ 0.85, mask mAP ≥ 0.80, measurement error ≤ 0.5 mm | release gate                                                                                                                   |

Companion `model-metadata.json` declares model version, classes, thresholds, input size, output shape, source weights, and **whether the export was evaluated in calibrated millimeters or pixel-space only**. Always set this flag honestly — it is what the app surfaces to the inspector.

## Calibration discipline

The model emits pixels. The app reports millimeters **only after calibration**. This repo validates calibration math separately from segmentation:

- **ArUco** with a known marker size → `px_per_mm`.
- **LiDAR / depth** → runtime path on the device; we validate the math, the device produces the depth.
- **Known-caliper target** → produces a measurement-error report.

Helpers live in `src/advance_seeds_ml/calibration.py`. The exported `model-metadata.json` must state whether the run was evaluated with calibrated mm measurements or only in pixel space.

## Git, commits, secrets

- **Conventional Commits** by convention (no automated commitlint here; keep it consistent with the demo repo: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- `.env` files are gitignored. `supabase/.env.example` and `.env.example` files are the templates.
- **Never commit:** R2 keys, Modal tokens, Supabase service-role keys, dataset images that aren't licensed for redistribution, raw model weights >100MB.
- Trained artifacts go through R2 + the registry, not into git.

## Spec-driven development (OpenSpec)

OpenSpec is **mandatory** here. Before non-trivial work:

1. Read `openspec/config.yaml`.
2. `openspec list --specs` and `openspec list` to see specs and active changes.
3. Create/update a change under `openspec/changes/<change-name>/` with `proposal.md`, `design.md`, `tasks.md`, and spec deltas.
4. Validate before finishing:

   ```bash
   openspec validate --all --strict
   python3 -m unittest discover -s tests
   ```

Canonical specs in this repo:

- `project-governance`
- `dataset-preparation`
- `segmentation-training`
- `calibration-validation`
- `mobile-model-export`
- `model-registry`
- `model-registry-web-dashboard`
- `hosted-training-trigger`
- `training-worker`
- `python-registry-sdk`

Codex OpenSpec skills under `.codex/skills/` are generated by `openspec init --tools codex --profile core .`.

## MCP servers

`.mcp.json` registers a single MCP server:

- **`colab-mcp`** — `uvx git+https://github.com/googlecolab/colab-mcp`, 30s timeout. Lets an agent drive a Google Colab session (useful for free-GPU training experiments). Requires `uv` / `uvx` installed locally.

## Common pitfalls

- **Filename alias is not a bug.** `yolo11n-seeds.tflite` ships YOLO26n-seg weights. The historical name is preserved for the app's runtime seam. Record the real source model in `model-metadata.json`; never rename the file unilaterally.
- **`[train]` extras are heavy.** Don't install them in CI that only needs to run dataset / contract tests. The bare scaffold (`pip install -e .`) is enough for `python -m unittest discover -s tests`.
- **R2 CORS must be applied** before the web dashboard can issue browser-side PUT/GET via presigned URLs. Apply `infra/r2-cors.json` with `wrangler r2 bucket cors put` (or the dashboard) whenever the allowed origins change.
- **`supabase db reset` wipes local state.** Use it freely locally; never against the cloud project.
- **Edge Function secrets in cloud are set with `supabase secrets set`**, not via `.env`. Local `.env.local` is for `supabase functions serve` only.
- **Two `openspec/` trees in this workspace.** Trainers/datasets/registry → here. Mobile screens / RLS / i18n → demo repo. Don't propose in the wrong one.
- **Acceptance gate is mm-accurate, not pixel-accurate.** A model that hits seg mAP but fails the ≤0.5 mm measurement bar is not releasable.
