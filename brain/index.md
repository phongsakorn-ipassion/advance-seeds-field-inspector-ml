---
project: ml-repo
type: index
status: active
tags: [index]
created: 2026-06-22
updated: 2026-06-22
sources: []
canonical: false
---

# Index — Map of Content

The catalog for this brain. Read first when querying. See [[README]] for conventions,
[[log]] for the timeline.

## Start here
- [[overview]] — what the ml repo is
- [[architecture]] — how all the subsystems fit together (the end-to-end flow)

## Canonical contracts (sources of truth)
- [[model-export-contract]] — what the app expects from an exported model
- [[compat-signature]] — what forces a native app rebuild
- [[dataset-pipeline]] — the YOLO-seg dataset layout the validator requires
- [[training-to-registry-flow]] — how class names flow web → Colab/Modal → registry → app
- [[model-registry-db]] — Supabase schema, RLS, realtime, R2 storage
- [[edge-functions]] — the Deno HTTP layer
- [[training-driver]] — training config + entry points
- [[drift-register]] — tracked code-vs-doc / contract divergences

## ml-repo deep-dives (`ml-repo/document/`)
- [[dataset-pipeline]] — dataset validation + current datasets (incl. v8)
- [[training-driver]] — `training.py` + local/Colab entry points
- [[training-worker]] — the hosted Modal worker
- [[python-registry-sdk]] — the `RegistryClient` HTTP SDK
- [[model-registry-db]] — Postgres + R2
- [[edge-functions]] — start-training, training-callback, resolve-channel, …
- [[web-dashboard]] — the React/Vite registry UI
- [[mobile-export]] — the candidate export script + metadata
- [[training-to-registry-flow]] — the class-flow architecture
- [[calibration]] — px ↔ mm math

## Decisions (`decisions/`)
- [[0001-derive-export-class-names-from-model]] — export reads classes from the model

## Not yet ingested (dangling links mark future work)
- ml-repo standard pages: `tech-stack`, `file-map`, `open-questions`
- `glossary`, `current-codebase-summary`
- the sibling demo app repo (cross-repo workflows, the app's `SeedAnalyzer`)
