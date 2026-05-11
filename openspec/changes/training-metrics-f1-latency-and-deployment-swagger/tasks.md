## 1. OpenSpec

- [x] 1.1 Add proposal, design, tasks, and delta specs for the change.
- [x] 1.2 Run `openspec validate training-metrics-f1-latency-and-deployment-swagger --strict`.
- [x] 1.3 After implementation, fold deltas into canonical specs and run `openspec validate --all --strict`.

## 2. Types and Data Layer

- [x] 2.1 Extend `MetricKey` with `"f1"` and add label/order entries in `apps/web/src/registry/metrics.ts` and `apps/web/src/App.tsx`.
- [x] 2.2 Add `pytorchInferenceMs`, `tfliteInferenceMs`, `coremlInferenceMs` optional fields to `RegistryVersion`.
- [x] 2.3 Read `metrics.inference_ms.{pytorch,tflite,coreml}` in `supabaseStore.ts` version mappers.
- [x] 2.4 Populate ms fields in `demoStore.ts` so demo mode shows values.
- [x] 2.5 Add `deriveF1Series(metricsHistory)` helper in `registry/metrics.ts` with unit tests for ordered output, missing pair, and divide-by-zero.

## 3. Dashboard UI — Metrics

- [x] 3.1 Add F1 toggle card and chart line to Run detail Training Metrics.
- [x] 3.2 Add a static three-card Inference Time row to Run detail Training Metrics sourced from the run's produced version.
- [x] 3.3 Add F1 `MetricCard` and three Inference Time `MetricCard`s to Model detail Performance row.
- [x] 3.4 Add `msMetric` formatter and `--` rendering for missing values.

## 4. Dashboard UI — Deployment Swagger

- [x] 4.1 Replace the three `<details className="mobile-contract-disclosure">` accordions with an API explorer card whose Open Swagger action opens a new tab.
- [x] 4.2 Create `apps/web/src/registry/openapi.ts` with `buildOpenApiSpec(version, deployments)` + unit tests.
- [x] 4.3 Render Swagger UI in the new tab via `swagger-ui-dist` from CDN, loading the spec via a blob URL (avoids the inline-spec URL-parsing bug in Swagger UI 5 / Safari).
- [x] 4.4 Auto-inject the configured Supabase anon key into every Try-it-out request as `apikey` and `Authorization: Bearer` headers.
- [x] 4.5 Surface any boot error from the Swagger tab inline at the top of the page for diagnosability.

## 5. Docs and Validation

- [x] 5.1 Update `docs/model-registry-handoff.md` and `docs/model-registry-api-postman.md` to mention the in-dashboard API explorer.
- [x] 5.2 Run `cd apps/web && npm run build`.
- [x] 5.3 Run `python3 -m unittest discover -s tests` (sanity check — no Python changes expected).
- [x] 5.4 Run `openspec validate --all --strict`.
- [x] 5.5 Manual smoke: run detail shows F1 line and ms cards; model detail Performance shows F1 + 3 ms cards; Deployment renders the API explorer with working Try-it-out against `functionsBaseUrl()`.
