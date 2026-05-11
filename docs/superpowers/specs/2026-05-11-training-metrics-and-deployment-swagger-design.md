# Training Metrics (F1 + Inference Time) and Deployment Swagger — Design

Date: 2026-05-11
Status: Draft → pending implementation
Author: brainstorming session, dashboard scope

## Goal

Two related dashboard improvements:

1. Surface two additional model-quality signals — F1-score and Inference Time
   (ms) — in both the run-detail Training Metrics panel and the model-detail
   Performance section.
2. Replace the three static endpoint accordions (Model Picker, Default Model,
   App Fields) in the model-detail Deployment section with an embedded,
   dynamically-generated Swagger UI scoped to the current model version.

Active deployments rows are intentionally **out of scope** for this change.

## Non-goals

- No trainer or Colab Python changes for F1 (derived client-side).
- No database migration. New version fields are optional and read-through.
- No mobile-app contract change (endpoint URLs and response shapes unchanged).
- No promotion of paid hosted training or new accelerator paths.

## Architecture

### F1-score — client-derived from precision/recall

`MetricKey` ([apps/web/src/registry/types.ts](../../../apps/web/src/registry/types.ts))
gains an `"f1"` entry. F1 is **not** persisted; it is computed in the rendering
layer:

- Run detail: a helper `deriveF1Series(metricsHistory)` zips per-epoch
  `precision` and `recall` MetricPoints, emits virtual `MetricPoint`s with
  `key: "f1"`. The Training Metrics panel adds an F1 toggle card and chart
  line. Empty when either precision or recall is missing.
- Model detail: `version.metricsSummary.precision` and `.recall` feed a single
  derived scalar; rendered as a `<MetricCard label="F1-score" />`.

`metricDisplayLabels` and `metricDisplayOrder` in
[apps/web/src/App.tsx](../../../apps/web/src/App.tsx) gain `"f1": "F1-score"`.

F1 formula: `2 * P * R / (P + R)` with `0` when `P + R === 0`.

### Inference Time (ms) — per-platform from version artifacts

Optional fields added to `RegistryVersion`:

- `pytorchInferenceMs?: number | null`
- `tfliteInferenceMs?: number | null`
- `coremlInferenceMs?: number | null`

`supabaseStore` reads these from version metadata when present (key paths
`metrics.inference_ms.{pytorch,tflite,coreml}`); absent values surface as
`null`. `demoStore` synthesises plausible values for the demo dataset.

A new `msMetric(value: number | null | undefined): string` formatter in
`App.tsx` renders `"85.4 ms"` or `"--"`.

UI placement:

- Model detail Performance: three additional `MetricCard`s (PyTorch / TFLite /
  CoreML) appended to the existing metrics row.
- Run detail Training Metrics: a static three-card row below the trend chart,
  sourced from the version produced by the run (`runId` lookup). When no
  version exists yet, cards show `--` with `pending export` hint.

Latency is **not** added to the trend chart (dimensionally unlike 0–1 ratios,
and ms is a static per-version quantity, not per-epoch).

### Deployment Swagger panel

Replace the three `<details className="mobile-contract-disclosure">` accordions
(at [App.tsx:2329-2406](../../../apps/web/src/App.tsx)) with a single
`<DeploymentSwaggerPanel version={...} deployments={...} />` component.

Approach:

- Add dependency `swagger-ui-react` (with bundled CSS) to
  `apps/web/package.json`.
- Pure helper `buildOpenApiSpec(version, deployments)` in a new file
  `apps/web/src/registry/openapi.ts` returns an OpenAPI 3.1 document with:
  - `GET /list-deployed-models` (one operation per deployed channel × platform,
    with `channel` and `platform` parameters defaulted)
  - `GET /resolve-channel` (with `current_version` defaulted to `version.id`
    and `current_compat` defaulted to `version.compatSignature`)
  - `GET /model-artifact/{kind}` (kind ∈ tflite | coreml | pytorch — only
    operations for artifacts that exist on the version)
- The component lazy-imports `swagger-ui-react` and renders inside the existing
  `.mobile-integration-panel` shell so the Postman handoff card and Mobile
  handoff header remain.
- Defensive fallback: if the dynamic import fails (offline / bundle issue),
  render the previous static accordion list using the same spec data so the
  feature degrades gracefully.

`functionsBaseUrl()` is used as the OpenAPI `servers[0].url`.

## Data flow

```
trainer → run_metrics (precision, recall) ──► dashboard derives F1 per-epoch
                                                │
                                                ▼
                                       Training Metrics chart + cards

version metadata.metrics.inference_ms.{pytorch,tflite,coreml}
        │
        ▼
supabaseStore.fromMetadata() → RegistryVersion.{pytorch,tflite,coreml}InferenceMs
        │
        ▼
Run detail (via runId lookup)  +  Model detail Performance row
```

```
RegistryVersion + RegistryDeployment[]
        │
        ▼
buildOpenApiSpec() ─► OpenAPI 3.1 doc ─► <SwaggerUI spec={...} />
```

## Error handling and edge cases

- F1 with missing precision or recall at an epoch → that epoch's F1 point is
  skipped. If neither summary value is present, F1 card shows `--`.
- Inference Time missing for a platform → individual card shows `--` with
  `pending export` (run page) or `not exported` (model page) hint.
- No deployments → Swagger panel still renders, but with only the list-models
  and resolve-channel operations against `staging` and `production` listed
  with a "not yet deployed" notice.
- `swagger-ui-react` dynamic import failure → fallback to static accordion
  endpoints derived from the same OpenAPI doc.

## Testing

- Unit: `deriveF1Series` (mixed presence, divide-by-zero, ordered output).
- Unit: `buildOpenApiSpec` (operations match deployed channels, defaults
  populated, only-present artifact kinds appear).
- Manual / smoke: dashboard renders run detail with synthetic F1 line and ms
  cards; model detail Performance shows F1 + 3 ms cards; Deployment section
  renders Swagger UI with "Try it out" producing requests against
  `functionsBaseUrl()`.

## Affected files

- `apps/web/package.json` — add `swagger-ui-react`.
- `apps/web/src/registry/types.ts` — extend `MetricKey`, add optional version
  ms fields.
- `apps/web/src/registry/metrics.ts` — add `deriveF1Series` and label.
- `apps/web/src/registry/openapi.ts` — new, `buildOpenApiSpec` helper.
- `apps/web/src/registry/supabaseStore.ts` — read inference_ms from metadata.
- `apps/web/src/registry/demoStore.ts` — populate ms fields and synthesize F1.
- `apps/web/src/App.tsx` — `metricDisplayLabels`/`Order`, Performance row,
  Training Metrics latency cards, replace accordions with
  `DeploymentSwaggerPanel`, add `msMetric` formatter.
- `apps/web/src/styles.css` — minor styling for swagger panel container.

## Affected OpenSpec capabilities

- `model-registry-web-dashboard` — modified (UI, metrics, deployment panel).
- `model-registry` — modified (version metadata reads optional inference_ms;
  shape additive, backward compatible).

## Rollout

- No database migration. No mobile contract change.
- Ship behind no flag; both panels degrade gracefully when fields/artifacts
  are missing.
- `npm run build` and `openspec validate --all --strict` gate the change.
