# Design — Export Mobile Model Candidates

## Context

The current banana-v1 and banana-v2 training runs both produce YOLO26n-seg
weights. The app needs side-by-side testing of unquantized and low-risk
quantized variants on Android and iOS.

## Decisions

### D1. Use candidate folders under `runs/mobile-exports`

Generated mobile binaries are heavy and environment-specific, so they remain
under ignored `runs/`. The committed script is the source of truth for
recreating them.

### D2. Export both platform formats per candidate

Each candidate folder contains:

- `<candidate>.tflite` for Android
- `<candidate>.mlpackage` for iOS
- `model-metadata.json`
- `manifest.json`

The root `model-candidates.index.json` lists all manifests.

### D3. Treat quantized as FP16 for this pass

INT8 conversion needs a larger representative calibration set and model-quality
comparison. The current quantized candidates use FP16 export to reduce size with
lower quality risk.

### D4. Hash both files and Core ML packages

TFLite artifacts are single files. Core ML `.mlpackage` artifacts are
directories, so package hashes are computed deterministically across package
file paths and bytes.

### D5. Keep dynamic loading in the app repo

This ML repo documents the app architecture and model package contract. The app
repo owns model browsing, downloading, storage, native loading, smoke tests, and
rollback.

## File Updates

- `.gitignore`
- `scripts/export_mobile_model_candidates.py`
- `docs/dynamic-model-loading-handoff.md`
- `openspec/specs/mobile-model-export/spec.md`
- `openspec/changes/export-mobile-model-candidates/*`

## Validation

- Run the exporter and verify all four candidate folders exist.
- Compile the exporter script.
- Run unit tests.
- Run `openspec validate --all --strict`.
