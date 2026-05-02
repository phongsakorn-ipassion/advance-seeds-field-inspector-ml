# Proposal — Export Mobile Model Candidates

## Why

The app needs to compare banana-v1 and banana-v2 models on-device before the
team chooses a default model. The repo also needs a concrete handoff for the
next app-side change: loading trained models from local storage or a download
source instead of embedding every model in the app build.

## What Changes

- Add a repeatable export script for four mobile candidates:
  `1-v1`, `2-v1-quantized`, `3-v2`, and `4-v2-quantized`.
- Export each candidate for Android as TensorFlow Lite and for iOS as Core ML.
- Write per-candidate metadata and manifests plus a root model-candidate index.
- Document the dynamic model browsing/downloading architecture for the app repo.
- Keep generated model binaries under ignored `runs/` output.

## Capabilities

### Modified Capabilities

- `mobile-model-export`: supports multiple named mobile candidates, manifests,
  platform-specific artifacts, hashes, and a downstream dynamic-loading handoff.

## Non-goals

- Implementing the dynamic model browser in the app repo.
- Selecting the final default model.
- Shipping INT8 quantization. Current quantized candidates are FP16 exports.
- Committing heavy exported model binaries.

## Impact

App agents can use the generated index and handoff doc to implement model
download/import flows for Android TFLite and iOS Core ML while this repo keeps a
repeatable export process for future model candidates.
