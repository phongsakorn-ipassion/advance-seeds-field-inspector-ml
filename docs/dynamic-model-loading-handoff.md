# Dynamic Model Loading Handoff

This handoff is for agents working in the consuming app repo:

```text
/Users/ppungpong/Github/advance-seeds-field-inspector-demo
```

The goal is to let the app browse, download, validate, select, and roll back
locally trained model artifacts instead of requiring every model update to be
embedded in the app build.

## Exported Candidates

The ML repo exports app-test candidates under:

```text
runs/mobile-exports/
```

The current candidate set is:

| Candidate | Dataset/run | Android artifact | iOS artifact | Quantization |
| --- | --- | --- | --- | --- |
| `1-v1` | banana-v1 best | `1-v1.tflite` | `1-v1.mlpackage` | none |
| `2-v1-quantized` | banana-v1 best | `2-v1-quantized.tflite` | `2-v1-quantized.mlpackage` | FP16 |
| `3-v2` | banana-v2 best | `3-v2.tflite` | `3-v2.mlpackage` | none |
| `4-v2-quantized` | banana-v2 best | `4-v2-quantized.tflite` | `4-v2-quantized.mlpackage` | FP16 |

The root index is:

```text
runs/mobile-exports/model-candidates.index.json
```

Each candidate folder contains:

```text
<candidate>/
  <candidate>.tflite
  <candidate>.mlpackage
  model-metadata.json
  manifest.json
```

The quantized exports are FP16 exports. They are intentionally not INT8 yet
because INT8 requires a larger representative calibration set and a separate
quality comparison against the unquantized model.

## Model Contract

The app should read `manifest.json` for artifact transfer details and
`model-metadata.json` for runtime compatibility.

Required metadata checks:

- `task` is `instance-segmentation`
- `model_name` is `yolo26n-seg`
- `input_size` is `640`
- `class_names` exactly match:
  `apple`, `apple_spot`, `banana`, `banana_spot`, `orange`, `orange_spot`
- `output_kind` is `segmentation`
- `output_shape` starts with `[1, 300, 38]` for the detection tensor; mask
  prototype output is handled by the platform decoder
- `calibration.required` is `true`

Manifest checks:

- Android artifact exists at `artifacts.tflite.path`
- iOS artifact exists at `artifacts.coreml.path`
- SHA-256 matches the downloaded or imported file/package
- `quantization` is either `none` or `fp16`

For Core ML packages, hash validation must walk the package directory
deterministically or use the hash already recorded by the ML export script.

## Source Options

Implement sources in this order:

1. Local file/folder import for development testing.
2. Local HTTP/LAN index served from `runs/mobile-exports/`.
3. Remote releases later, such as GitHub Releases, S3, or an internal model
   registry.

For local HTTP testing from this repo:

```bash
python3 -m http.server 8765 --directory runs/mobile-exports
```

The app can then fetch:

```text
http://<machine-ip>:8765/model-candidates.index.json
```

## App Architecture

Add a platform-neutral model management layer and keep platform-specific runtime
loading behind adapters.

### ModelRegistryService

Responsibilities:

- Read a local index file or fetch `model-candidates.index.json`.
- Parse each candidate manifest.
- Normalize paths relative to the index URL or imported root folder.
- Filter candidates by platform support.
- Expose available and installed model records.

### ModelDownloadService

Responsibilities:

- Download or import the platform artifact and metadata.
- Validate SHA-256 before activation.
- Write into a temporary folder first.
- Atomically move the validated package into the app model store.
- Preserve the previous active model until the new model passes a smoke test.

Recommended app storage:

```text
<documents>/models/
  registry.json
  active-model.json
  <candidate-id>/
    model.tflite
    model.mlpackage or model.mlmodelc
    model-metadata.json
    manifest.json
```

### ModelRuntimeAdapter

Expose one interface used by the analyzer flow:

```ts
type LoadedModel = {
  id: string;
  metadata: ModelMetadata;
  platform: 'android' | 'ios';
  quantization: 'none' | 'fp16';
};

interface ModelRuntimeAdapter {
  load(modelRecord: InstalledModelRecord): Promise<LoadedModel>;
  unload(): Promise<void>;
  smokeTest(model: LoadedModel): Promise<ModelSmokeTestResult>;
}
```

Android behavior:

- Load `.tflite` from the installed model path.
- Prefer GPU delegate or NNAPI only after functional CPU loading works.
- Keep CPU fallback enabled because some TFLite delegate paths reject specific
  segmentation ops.

iOS behavior:

- Import `.mlpackage`.
- If the native module needs a compiled model, compile it with
  `MLModel.compileModel(at:)` and store the resulting `.mlmodelc`.
- Load the compiled path through the Core ML analyzer module.
- Keep the original `.mlpackage` for recompile after app/runtime upgrades.

### ModelSelectionScreen

Expected UX:

- Show available models from the selected source.
- Show installed models.
- Show version, dataset/run, quantization, platform artifact size, and current
  active marker.
- Provide download/import, activate, rollback, and delete actions.
- Block activation when compatibility or smoke inference fails.

## Runtime Flow

Startup:

1. Read `active-model.json`.
2. Verify the artifact still exists.
3. Verify SHA-256 or stored integrity status.
4. Load through the platform adapter.
5. Fall back to the bundled model if dynamic loading fails.

Browse/download:

1. Load index.
2. Select candidate.
3. Download/import `manifest.json`, `model-metadata.json`, and the platform
   artifact.
4. Validate SHA-256.
5. Validate metadata compatibility.
6. Run smoke inference against a known sample image.
7. Mark the model as installed.
8. Activate only after smoke inference passes.

Rollback:

1. Keep the previous active model record until the replacement passes.
2. Provide a rollback action that restores the previous active record.
3. If the current model fails at startup, auto-fallback to bundled or previous
   installed model and record the failure.

## Decoder Notes

The exported YOLO26n-seg mobile artifacts emit raw segmentation tensors. The
app-side decoder must handle the detection tensor and mask prototype tensor for
instance masks. Do not assume a detection-only `(N, 300, 6)` model when loading
these artifacts.

The destination app defaults discussed for the demo are `confidence=0.5` and
`iou=0.75`. Keep those as UI/runtime defaults for demo testing, but preserve the
metadata thresholds as the model author's baseline. The app should allow
per-model threshold overrides during QA.

## Acceptance Criteria

- Android can import or download a `.tflite` candidate, validate SHA-256, load
  it from app storage, run smoke inference, activate it, and roll back.
- iOS can import or download a `.mlpackage`, compile to `.mlmodelc` if needed,
  validate integrity, run smoke inference, activate it, and roll back.
- The app can read `model-candidates.index.json` from a local HTTP server.
- The model selection screen clearly separates available, installed, active,
  failed, and unsupported models.
- A bad hash, unsupported class list, missing artifact, or failed smoke test
  prevents activation and leaves the previous model active.
- The bundled model remains a fallback path.

## Implementation Tasks For App Agents

1. Add TypeScript types for `ModelMetadata`, `ModelCandidateManifest`, and
   `InstalledModelRecord`.
2. Add `ModelRegistryService` with local file and HTTP index readers.
3. Add `ModelDownloadService` with SHA-256 validation and atomic install.
4. Add platform-specific runtime adapters for Android TFLite and iOS Core ML.
5. Add native iOS support to compile `.mlpackage` to `.mlmodelc` if the current
   Core ML runner cannot load packages directly.
6. Add a model selection/settings screen.
7. Add smoke inference using one known image and expected non-empty output.
8. Add fallback and rollback behavior.
9. Add QA documentation for serving `runs/mobile-exports/` over local HTTP.
