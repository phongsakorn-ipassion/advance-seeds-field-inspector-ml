---
project: ml-repo
type: architecture
status: active
tags: [architecture]
created: 2026-06-22
updated: 2026-06-22
sources: [CLAUDE.md, supabase/migrations/, supabase/functions/, apps/web/src/, packages/training-worker/src/]
canonical: false
---

# Architecture — how the pieces fit

> [!abstract] TL;DR
> A registry-centric pipeline: a **web dashboard** kicks off training (Colab or Modal),
> a **worker** trains YOLO26n-seg and uploads artifacts to **R2**, a **callback** writes
> a `versions` row in **Supabase**, and the **mobile app** resolves a channel → version
> → signed artifact URL. Everything is bound by two contracts: [[model-export-contract]]
> and [[compat-signature]].

## The end-to-end flow

```
dataset YAML (names:)                       [[dataset-pipeline]]
   │ upload (presigned PUT)
   ▼
web dashboard  ──startTraining──►  start-training (edge fn)  ──►  runs row
   │                                                               │ dispatch
   │                                          ┌────────────────────┴──────────┐
   │                                          ▼                                ▼
   │                                   Colab (train_for_run.py)        Modal worker
   │                                          │  train + export (TFLite/CoreML/.pt)
   │                                          ▼  upload-artifact (presigned PUT → R2)
   │                                   training-callback (HMAC) ──► versions row
   │                                          (trigger computes [[compat-signature]])
   ▼ Realtime                                                          │ deploy
dashboard live updates                                          channel_deployments
                                                                       │
mobile app ──resolve-channel──► version + signed R2 URL ──► download   ▼
```

## The subsystems (deep-dives)
- [[dataset-pipeline]] — YOLO-seg validation + layout
- [[training-driver]] — `training.py` + entry scripts (local / Colab)
- [[training-worker]] — the hosted Modal worker
- [[python-registry-sdk]] — how training talks to the registry
- [[model-registry-db]] — Supabase schema, RLS, realtime, R2
- [[edge-functions]] — the Deno HTTP layer
- [[web-dashboard]] — the React/Vite UI
- [[mobile-export]] — producing the app artifacts
- [[calibration]] — px↔mm math

## The two binding contracts
- [[model-export-contract]] — the artifact + metadata shape the app consumes
- [[compat-signature]] — what forces a native app rebuild

## Boundary
This repo owns training + registry + export. The mobile app lives in the sibling
`advance-seeds-field-inspector-demo` repo; the two share one Supabase project. Known
divergences are tracked in [[drift-register]].

## Related
- [[overview]] · [[index]]
