---
project: ml-repo
type: overview
status: active
tags: [overview]
created: 2026-06-22
updated: 2026-06-22
sources: [CLAUDE.md, pyproject.toml]
canonical: false
---

# advance-seeds-field-inspector-ml — overview

> [!abstract] TL;DR
> Everything that produces, evaluates, registers, and ships **on-device fruit/seed
> segmentation models** (Ultralytics YOLO26n-seg) for the demo field-inspector app.

## Responsibility
Owns: dataset prep/validation, training (local + hosted on Modal), calibration-math
validation, mobile export (TFLite/Core ML + metadata), the model registry (Supabase +
R2 + web dashboard), and artifact handoff into the demo app.

Does NOT own: the mobile app UI/runtime (that's the sibling `…-demo` repo). The two
share one Supabase project; this repo's migrations own the registry tables.

## The pipeline at a glance
dataset ([[dataset-pipeline]]) → training (web→Colab/Modal, [[training-to-registry-flow]])
→ registry (Supabase + R2) → mobile export ([[mobile-export]]) → app, all bound by
the [[model-export-contract]].

## Key entry points
- `scripts/validate_dataset.py` — validate a dataset config (no train deps)
- `scripts/train_for_run.py` — training driver bound to a registry run row
- `scripts/export_mobile_model_candidates.py` — export TFLite/Core ML candidates
- `scripts/write_model_metadata.py` — emit the app-facing metadata JSON
- `apps/web/` — React/Vite registry dashboard; `supabase/functions/` — Deno edge fns

## Conventions
- Tests: stdlib `unittest` (`python3 -m unittest discover -s tests`). Vitest for web.
- OpenSpec is mandatory before non-trivial work (`openspec/`).
- Datasets + heavy artifacts are gitignored; they move through R2 + the registry.

## Related
- [[architecture]] · [[model-export-contract]] · [[drift-register]] · [[index]]
