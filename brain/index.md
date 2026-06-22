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
- [[overview]] — what the ml repo is and its pipeline at a glance

## Canonical contracts (sources of truth)
- [[model-export-contract]] — what the app expects from an exported model
- [[dataset-pipeline]] — the YOLO-seg dataset layout the validator requires
- [[training-to-registry-flow]] — how class names flow web → Colab/Modal → registry → app
- [[drift-register]] — tracked code-vs-doc / contract divergences

## ml-repo deep-dives (`ml-repo/document/`)
- [[dataset-pipeline]] — dataset validation + current datasets (incl. v8)
- [[mobile-export]] — the candidate export script + metadata
- [[training-to-registry-flow]] — the class-flow architecture

## Decisions (`decisions/`)
- [[0001-derive-export-class-names-from-model]] — export reads classes from the model

## Not yet ingested (dangling links mark future work)
- `architecture`, `tech-stack`, `file-map`, `open-questions` (ml-repo standard set)
- registry deep-dives: Supabase schema, edge functions, R2 storage, web dashboard
- calibration math, training-worker (Modal), python-registry-sdk
- `glossary`, `current-codebase-summary`
