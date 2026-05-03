## 1. OpenSpec

- [x] 1.1 Add proposal, design, and requirements for dual-platform deployed models.

## 2. Schema and Edge Functions

- [x] 2.1 Add `channel_deployments` migration with active/default indexes.
- [x] 2.2 Extend storage delete to block/archive active deployments and delete both artifacts.
- [x] 2.3 Add `list-deployed-models` Edge Function for mobile platform selection.
- [x] 2.4 Update `resolve-channel` to include platform artifact metadata.

## 3. Training and Worker

- [x] 3.1 Extend `upload-artifact` to accept Core ML package zip uploads.
- [x] 3.2 Export/upload Core ML from `scripts/train_for_run.py`.
- [x] 3.3 Extend hosted worker upload and callback success payload for Core ML.
- [x] 3.4 Quantize Android TF Lite with representative INT8 calibration and
      record per-platform export precision metadata.
- [x] 3.4 Update worker and callback tests.

## 4. Dashboard

- [x] 4.1 Model lifecycle shows Android/iOS artifact readiness.
- [x] 4.2 Deploy adds active channel deployments and can set channel default.
- [x] 4.3 Revise Model detail deployment section into a mobile integration
      panel with list and default-resolve endpoint examples.
- [x] 4.3 Model detail shows deployment membership and mobile integration endpoint.
- [x] 4.4 Archive/delete is disabled for any active deployment.
- [x] 4.5 Restyle active deployment membership and make endpoint copy actions
      icon-only.

## 5. Validation

- [x] 5.1 Run `cd apps/web && npm run build`.
- [x] 5.2 Run `python3 -m unittest discover -s tests`.
- [x] 5.3 Run Deno checks/tests for touched Edge Functions.
- [x] 5.4 Run `openspec validate --all --strict`.
