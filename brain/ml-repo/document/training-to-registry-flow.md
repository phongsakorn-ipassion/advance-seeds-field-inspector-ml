---
project: ml-repo
type: architecture
status: active
tags: [training, registry, classes, colab, modal]
created: 2026-06-22
updated: 2026-06-22
sources: [apps/web/src/App.tsx#L147-L173, supabase/functions/start-training/index.ts, scripts/train_for_run.py#L289, notebooks/train_run.ipynb, supabase/functions/training-callback/index.ts#L85]
canonical: true
---

# Class flow: web → Colab/Modal → registry → app (canonical)

> [!abstract] TL;DR
> Class names are **fully data-driven** end to end. Nothing in the training/registry
> pipeline hardcodes a class list — they flow from the dataset YAML's `names:` block.
> (The one place that *used* to hardcode them was mobile export; fixed — see
> [[0001-derive-export-class-names-from-model]].)

## The flow (verified, with citations)

1. **Web form** parses classes from the uploaded dataset YAML's `names:` block —
   `parseYoloClasses()` at `apps/web/src/App.tsx:147`. Classes are shown **read-only**
   (`App.tsx:1345`); to change them you upload a different YAML. No hardcoded list.
2. **`start-training` edge function** passes the config through verbatim and stores it
   on the `runs` row (`supabase/functions/start-training/index.ts`). It does **not**
   validate classes.
3. **Training worker / `train_for_run.py`** reads classes from the run config
   (`run_config.get("classes", [])`, `scripts/train_for_run.py:289`) for metadata;
   the actual training reads `names:` from the dataset YAML that Ultralytics loads.
4. **Colab** (`notebooks/train_run.ipynb`) is stateless: it fetches the run config from
   Supabase and shells out to `train_for_run.py`. Modal is the hosted-GPU equivalent.
5. **`training-callback`** writes class names into the version metadata
   (`cfg.classes ?? cfg.class_names ?? []`, `training-callback/index.ts:85`).
6. **App** reads `class_names` from the version metadata to label detections.

## Consequence

> [!check] To train on new classes (e.g. pepper, watermelon): just upload a dataset
> YAML with those `names:`. No code change anywhere in training or registry.

> [!warning] Export was the exception — it hardcoded `CLASS_NAMES=[banana,banana_spot]`
> and would mislabel any other model. Fixed in [[mobile-export]] /
> [[0001-derive-export-class-names-from-model]]. Shipping >2 classes to the *app* is
> still a deliberate gate — see [[drift-register]].

## Related
- [[dataset-pipeline]] · [[mobile-export]] · [[model-export-contract]]
