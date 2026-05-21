# Per-run quantization toggles & per-step training logs

**Date:** 2026-05-21
**Status:** Approved (brainstorming complete, awaiting written-spec review)
**Scope:** Web dashboard + Colab notebook + `train_for_run.py` + edge functions

## Goal

1. Let users enable/disable iOS (Core ML) and Android (TF Lite) exports per training run, and surface the choice throughout the pipeline.
2. Replace today's free-text run log with structured per-step progress covering the six Jupyter notebook steps, including sub-phases for the training step.

## Non-goals

- Per-platform precision selection (iOS stays FP16, Android stays INT8 — see decision Q2).
- Project-level export defaults (per-run only — Q1).
- Schema migration for logs (we keep `runs.config_yaml.logs[]` — Q3).
- Quantization for ONNX/TorchScript.

## Decisions captured during brainstorming

| # | Decision |
|---|---|
| Q1 | Toggles live on the Start Training form (per-run). |
| Q2 | Enable/disable only; precision stays at today's values. |
| Q3 | Reuse `runs.config_yaml.logs[]`; entries become structured objects. |
| Q4 | Disabled exports produce a version row with `precision = "skipped"` and null `r2_key`. |
| Q5 | Step 5 emits sub-phase logs (`dataset-ready`, `model-init`, `training`, `export`, `upload`). |

## Data model

### `runs.config_yaml` (JSONB, no migration)

Two new/changed fields alongside the existing `hyperparameters`, `dataset`, `classes`, etc.

```jsonc
{
  "exportOptions": {
    "ios":     { "enabled": true,  "precision": "fp16" },
    "android": { "enabled": true,  "precision": "int8" }
  },
  "logs": [
    {
      "ts": "2026-05-21T08:14:03Z",
      "step": 4,                 // 1..6, or null for legacy/free text
      "phase": "dataset-ready",  // step-5 sub-phase; null otherwise
      "status": "ok",            // ok | error | info | started
      "message": "Dataset YAML resolved at /content/.../data.yaml"
    }
  ]
}
```

Legacy `string` entries in `logs[]` remain valid; readers normalize them to `{message, step: null, phase: null, status: "info"}`.

### `versions` row

No new columns. Sentinel values widen the existing precision string:

| Value | Meaning | `r2_key` |
|---|---|---|
| `int8` / `fp16` / `fp32` | Artifact produced (today's behavior) | non-null |
| `skipped` | User disabled this platform | null |
| `failed` | Export attempted but errored | null |

`coreml_size_mb`, `coreml_inference_ms`, `coreml_content_hash` are null when precision is `skipped` or `failed`. Same for TFLite.

## Web UI changes (`apps/web/src/`)

### Start Training form (`App.tsx`)

Add an "Export targets" group below hyperparameters:

```
Export targets
  [x] iOS (Core ML, FP16)
  [x] Android (TF Lite, INT8)
```

- Validation: form submit disabled if both checkboxes unchecked.
- On submit, the run-create payload includes `config.exportOptions` (shape above).
- `registry/types.ts` `RegistryRunConfig` gains an `exportOptions` field with the shape above.

### Run detail "Training config" card

Adds a line:

> Export targets: iOS Core ML FP16 · Android disabled

(Truthful echo of `config.exportOptions`.)

### Model Detail artifacts panel (`App.tsx:2188-2212`)

For each artifact row:

- `precision === "skipped"` → render dimmed `Core ML · disabled`, no download button.
- `precision === "failed"` → render with warning icon `Core ML · failed`, no download button.
- Otherwise unchanged.

### Run logs panel (`App.tsx:2649-2655`)

- New 6-dot stepper at the top. Dot for step *N* turns:
  - grey before any log with `step=N` arrives,
  - blue while only `status=started|info` logs for step *N* exist,
  - green once a `status=ok` for step *N* arrives,
  - red on any `status=error` for step *N*.
- Log lines prefixed with `[N]` or `[N·phase]`. Legacy string lines render without prefix.

## Notebook changes (`notebooks/train_run.ipynb`)

- Remove the env-var assignments `ADVANCE_SEEDS_COREML_INT8` and `ADVANCE_SEEDS_QUANT_FRACTION`. The trainer now reads `config.exportOptions` instead.
- Add a tiny helper cell defining `log_step(step, phase, status, message)` that PATCHes `runs.config_yaml.logs[]` with one append (read-modify-write, same pattern as `train_for_run.py:482-496`).
- Instrument:
  - Cell 1 (start): `log_step(2, None, "started", f"Notebook execution started · SHA {git_sha}")`.
  - Cell 7 (auth): `log_step(3, None, "ok", "Authenticated as service_role")` or error.
  - Cell 10 (dataset): `log_step(4, None, "ok", f"Dataset resolved · {n_images} images · {dataset_name}")` or error.
- Cell 12 still launches `train_for_run.py`; that script owns step 5+.

## Trainer changes (`scripts/train_for_run.py`)

### New helpers

- `load_export_options(run_config) -> dict`: returns `{ios: {enabled, precision}, android: {enabled, precision}}` with safe defaults for legacy runs (both enabled, today's precisions).
- `log_step(step, phase, status, message)`: structured-entry equivalent of `append_log`. Writes the object shape to `logs[]`. Keep `append_log` for any free-text fallback (becomes `step=None`).

### Refactored flow

```python
options = load_export_options(run_config)
log_step(5, "dataset-ready", "ok", f"Dataset ready · {n_images} images")
log_step(5, "model-init", "ok", f"Loaded {source_weights} on {device}")
# ... training loop; per-epoch callback writes log_step(5, "training", "info", "Epoch N/total | ...")

if options["android"]["enabled"]:
    log_step(5, "export", "started", "TFLite INT8 export starting")
    try:
        export(...)  # existing call
        log_step(5, "export", "ok", f"TFLite INT8 export done · {size_mb} MB")
    except Exception as e:
        tflite_precision = "failed"
        log_step(5, "export", "error", f"TFLite export failed: {e}")
else:
    tflite_precision = "skipped"
    log_step(5, "export", "info", "TFLite disabled · skipping")

# Symmetric block for CoreML / iOS.

log_step(5, "upload", "started", f"Uploading {n_artifacts} artifacts to R2")
# ... existing upload loop
log_step(6, None, "ok", f"Version {version_name} created")
```

### `build_version_metadata` (L172-219)

- When a platform is `skipped` or `failed`: emit the artifact entry with `precision` set to that sentinel, omit `r2_key`/`size_bytes`/`content_hash`.
- The `quantization` sub-object continues to record `precision`, `method`, calibration fields where applicable; `method` is `"none"` for `skipped`/`failed`.

### `registry.create_version` payload

`tflite_precision` / `coreml_precision` accept the new sentinels; `tflite_r2_key` / `coreml_r2_key` may be null.

## Edge function changes (`supabase/functions/list-deployed-models`)

When returning artifacts for a version, filter out any artifact with `precision IN ('skipped','failed')` or null `r2_key`. Mobile clients see only the platforms that actually have a build.

`download-artifact` and `upload-artifact` need no changes — they're keyed by `r2_key`.

## Error handling

| Case | Behavior |
|---|---|
| Both platforms disabled at submit | Form blocks; create-run edge function also rejects (defense in depth). |
| Export fails mid-run | Precision becomes `"failed"`; run continues; other artifacts still publish. |
| Notebook `log_step` PATCH fails | Helper logs to stdout, returns; progress logging is best-effort. |
| Legacy run (no `exportOptions`) | Trainer defaults to today's behavior. |
| Concurrent PATCH on `logs[]` | Avoided by single-writer convention (notebook owns 2–4, trainer owns 5–6, never overlap). |

## Testing strategy

- **Trainer unit tests**: `load_export_options` defaulting; metadata builder emits `skipped`/`failed` correctly; `log_step` writes the documented shape.
- **Frontend**: render tests for the stepper component (grey/blue/green/red transitions), Training config card with each toggle permutation, Model Detail artifact row for `skipped`/`failed`.
- **End-to-end smoke**: one Colab run with Android-only (iOS disabled) — verify version row has `coreml_precision = "skipped"`, `tflite_*` populated, and Model Detail UI matches.

## Files in scope

- `apps/web/src/App.tsx` — Start Training form, Training config card, Model Detail artifacts panel, run logs panel + stepper.
- `apps/web/src/registry/types.ts` — `RegistryRunConfig.exportOptions`, `RegistryRunLogEntry` union (string | structured), `RegistryVersion.*Precision` widened to include `"skipped" | "failed"`.
- `scripts/train_for_run.py` — `load_export_options`, `log_step`, guarded export blocks, `build_version_metadata` updates.
- `src/advance_seeds_ml/registry/client.py` — accept new precision sentinels in create_version payload typing.
- `notebooks/train_run.ipynb` — remove env-var cells, add `log_step` helper + instrumentation in cells 1, 7, 10.
- `supabase/functions/list-deployed-models/index.ts` — filter skipped/failed artifacts.
- `supabase/functions/create-run/index.ts` (or equivalent) — reject runs with both platforms disabled.

## Open follow-ups (out of scope)

- Migrating `logs[]` to an append-only `run_logs` table (we chose to defer — Q3).
- Per-platform precision dropdowns (defer — Q2).
- Notebook templating / dynamic generation (current static notebook is sufficient once env vars are removed).
