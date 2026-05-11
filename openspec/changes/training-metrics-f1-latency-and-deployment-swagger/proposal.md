## Why

Operators need two additional model-quality signals visible while triaging
runs and deciding promotions: F1-score (a balanced precision/recall summary)
and Inference Time in milliseconds (a deployment-readiness signal that mAP and
mask metrics do not capture). The current Run detail and Model detail surfaces
expose neither.

Separately, the model-detail Deployment section exposes mobile endpoints as
three static accordions (Model Picker, Default Model, App Fields) plus an
external Postman link. Operators have to copy URLs out and try them elsewhere
to verify a deployment. An embedded Swagger UI scoped to the current version
lets operators inspect and exercise the live endpoints in place.

## What Changes

- Add an F1-score metric (derived from precision and recall) to:
  - Run detail Training Metrics panel — toggle card and chart line.
  - Model detail Performance section — `MetricCard`.
- Add Inference Time (ms) per platform (PyTorch / TFLite / CoreML) to:
  - Run detail Training Metrics panel — static three-card row from the
    version produced by the run.
  - Model detail Performance section — three additional `MetricCard`s.
- Replace the three static endpoint accordions in the Deployment section with
  an embedded Swagger UI rendered from a dynamically-built OpenAPI 3.1 spec
  scoped to the current version and its active deployments.
- Read optional `metrics.inference_ms.{pytorch,tflite,coreml}` from version
  metadata; absent values render as `--`.

Non-goals:

- No trainer / Colab Python changes. F1 is derived client-side from existing
  precision/recall MetricPoints.
- No database migration. New fields on `RegistryVersion` are optional.
- No change to the mobile-app contract: endpoint paths, parameters, and
  response shapes are unchanged.
- No change to the Active deployments rows (platform pills remain).

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `model-registry-web-dashboard`: Run detail and Model detail render F1-score
  and Inference Time; Deployment section renders an embedded Swagger UI panel
  in place of three static endpoint accordions.
- `model-registry`: Version metadata MAY include
  `metrics.inference_ms.{pytorch,tflite,coreml}` numeric fields read by the
  dashboard. The shape is additive and backward compatible.

## Impact

- Dashboard code in `apps/web/src` (App.tsx, registry/types.ts,
  registry/metrics.ts, registry/openapi.ts (new), registry/supabaseStore.ts,
  registry/demoStore.ts, styles.css).
- New runtime dependency `swagger-ui-react` (plus its CSS) in
  `apps/web/package.json`.
- Existing OpenSpec specs for `model-registry-web-dashboard` and
  `model-registry`.
- Docs: `docs/model-registry-handoff.md`, `docs/model-registry-api-postman.md`
  (note in-dashboard Swagger panel).
