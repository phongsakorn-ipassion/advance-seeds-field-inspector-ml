## 1. OpenSpec

- [x] 1.1 Add proposal, design, tasks, and delta specs for train pipeline metrics.
- [x] 1.2 Update canonical specs after implementation.

## 2. Dashboard

- [x] 2.1 Require dataset config, dataset bundle, and source weights before run creation.
- [x] 2.2 Remove Colab accelerator selection and new config serialization.
- [x] 2.3 Keep only patience, LR0, and batch in Advanced hyperparameters.
- [x] 2.4 Add normalized live metric history/summary mapping.
- [x] 2.5 Add run-detail metric cards and chart.
- [x] 2.6 Expand model detail metric display and render missing historical values as `--`.

## 3. Training Metadata

- [x] 3.1 Normalize final metrics in `scripts/train_for_run.py`.
- [x] 3.2 Normalize hosted worker/callback final metrics while preserving raw metric names.
- [x] 3.3 Add/adjust tests for metric normalization and callback payload handling.

## 4. Docs and Validation

- [x] 4.1 Update training/hosted docs for required inputs, no dashboard accelerator, and metric names.
- [x] 4.2 Run `cd apps/web && npm run build`.
- [x] 4.3 Run `deno test supabase/functions/training-callback/callback.test.ts`.
- [x] 4.4 Run `python3 -m unittest discover -s tests`.
- [x] 4.5 Run `openspec validate --all --strict`.
