## Context

Full design rationale lives in
[docs/superpowers/specs/2026-05-11-training-metrics-and-deployment-swagger-design.md](../../../docs/superpowers/specs/2026-05-11-training-metrics-and-deployment-swagger-design.md).
This file captures the spec-driven decisions and trade-offs that matter for
implementation review.

## Decisions

### F1-score is derived, not persisted

F1 is `2·P·R / (P+R)` with `0` when `P+R == 0`. Computing it client-side from
the existing `precision`/`recall` MetricPoints (Run detail) and
`metricsSummary.precision/recall` (Model detail) avoids any trainer / Colab /
Supabase migration and works retroactively on existing runs and versions.

A new `"f1"` member of `MetricKey` carries the derived series for the chart;
`deriveF1Series(metricsHistory)` zips per-epoch points.

Trade-off: the alternative — trainer-written F1 — would be authoritative but
requires changes across three surfaces (`scripts/train_for_run.py`,
`packages/training-worker`, and `training-callback`) for negligible accuracy
benefit, since precision and recall are already first-class.

### Inference Time is per-platform and static

Latency is a property of the exported model, not a training-time time series.
We expose three optional numeric fields on `RegistryVersion`
(`pytorchInferenceMs`, `tfliteInferenceMs`, `coremlInferenceMs`) read from
optional `metrics.inference_ms.{...}` keys in version metadata. The Run
detail panel reads them via the run's produced version. Cards render `--`
until exports populate the metadata.

Latency is **not** added to the trend chart. Mixing 0–1 ratio metrics with
millisecond magnitudes on a shared axis is misleading; a separate axis would
add chart complexity that operators have not asked for.

### Deployment Swagger panel uses `swagger-ui-react`

`swagger-ui-react` renders an interactive Swagger UI inside the dashboard. A
pure helper `buildOpenApiSpec(version, deployments)` produces an OpenAPI 3.1
document with operations for `list-deployed-models`, `resolve-channel`, and
`model-artifact/{kind}` — pre-filled with the current `version.id`,
`compatSignature`, and active channels.

Trade-offs considered:

- Hand-rolled endpoint list (smaller bundle, no "Try it out"). Rejected:
  loses the main operator benefit — exercising endpoints in place.
- Hosted external Swagger Editor with the spec passed via URL. Rejected:
  external dependency, leaks model identifiers to a third party.

Defensive fallback: if `swagger-ui-react` fails to load, the component renders
the same OpenAPI spec as a static endpoint list (same data, no interactivity)
so the section never appears broken.

### Active deployments rows are unchanged

The original proposal included removing Android TF Lite / iOS Core ML pills
from the Active deployments rows. The operator reversed that decision during
brainstorming; pills remain.

## Risks

- `swagger-ui-react` adds ~1.5 MB minified to the dashboard bundle. The web
  app is admin-only, not user-facing; this is acceptable. Lazy-importing the
  module keeps the cost off the initial paint of other dashboard sections.
- `buildOpenApiSpec` must produce the exact parameter names the Supabase Edge
  Functions accept (`model_line`, `channel`, `platform`, `current_version`,
  `current_compat`). Unit tests pin these.
- F1 derivation from sparse per-epoch metrics could surface an unexpected
  zero if precision is reported but recall is not (or vice versa). Strategy:
  emit a point only when both keys exist for the same epoch.

## Migration

No database migration. `metrics.inference_ms.{pytorch,tflite,coreml}` is an
additive optional metadata shape; older versions read as `null` and render
as `--`. Mobile-app contract unchanged.
