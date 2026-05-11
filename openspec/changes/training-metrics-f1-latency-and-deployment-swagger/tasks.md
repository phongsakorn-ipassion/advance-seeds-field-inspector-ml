## 1. OpenSpec

- [ ] 1.1 Add proposal, design, tasks, and delta specs for the change.
- [ ] 1.2 Run `openspec validate training-metrics-f1-latency-and-deployment-swagger --strict`.
- [ ] 1.3 After implementation, fold deltas into canonical specs and run `openspec validate --all --strict`.

## 2. Types and Data Layer

- [ ] 2.1 Extend `MetricKey` with `"f1"` and add label/order entries in `apps/web/src/registry/metrics.ts` and `apps/web/src/App.tsx`.
- [ ] 2.2 Add `pytorchInferenceMs`, `tfliteInferenceMs`, `coremlInferenceMs` optional fields to `RegistryVersion`.
- [ ] 2.3 Read `metrics.inference_ms.{pytorch,tflite,coreml}` in `supabaseStore.ts` version mappers.
- [ ] 2.4 Populate ms fields in `demoStore.ts` so demo mode shows values.
- [ ] 2.5 Add `deriveF1Series(metricsHistory)` helper in `registry/metrics.ts` with unit tests for ordered output, missing pair, and divide-by-zero.

## 3. Dashboard UI — Metrics

- [ ] 3.1 Add F1 toggle card and chart line to Run detail Training Metrics.
- [ ] 3.2 Add a static three-card Inference Time row to Run detail Training Metrics sourced from the run's produced version.
- [ ] 3.3 Add F1 `MetricCard` and three Inference Time `MetricCard`s to Model detail Performance row.
- [ ] 3.4 Add `msMetric` formatter and `--` rendering for missing values.

## 4. Dashboard UI — Deployment Swagger

- [ ] 4.1 Add `swagger-ui-react` to `apps/web/package.json`.
- [ ] 4.2 Create `apps/web/src/registry/openapi.ts` with `buildOpenApiSpec(version, deployments)` + unit tests.
- [ ] 4.3 Replace the three `<details className="mobile-contract-disclosure">` accordions with a `DeploymentSwaggerPanel` component that lazy-imports `swagger-ui-react`.
- [ ] 4.4 Implement defensive fallback that renders a static endpoint list from the same OpenAPI spec when the dynamic import fails.
- [ ] 4.5 Style the Swagger container so it sits cleanly inside `.mobile-integration-panel`.

## 5. Docs and Validation

- [ ] 5.1 Update `docs/model-registry-handoff.md` and `docs/model-registry-api-postman.md` to mention the in-dashboard Swagger panel.
- [ ] 5.2 Run `cd apps/web && npm run build`.
- [ ] 5.3 Run `python3 -m unittest discover -s tests` (sanity check — no Python changes expected).
- [ ] 5.4 Run `openspec validate --all --strict`.
- [ ] 5.5 Manual smoke: run detail shows F1 line and ms cards; model detail Performance shows F1 + 3 ms cards; Deployment renders Swagger UI with working Try-it-out against `functionsBaseUrl()`.
