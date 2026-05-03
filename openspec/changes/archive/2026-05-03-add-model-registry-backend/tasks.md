# Tasks — Add Model Registry Backend

## 1. Schema And RLS

- [x] 1.1 Add migrations for `model_lines`, `runs`, `run_metrics`, `versions`, `channels`, `channel_history`.
- [x] 1.2 Add the `compute_compat_signature` SQL function and `versions` trigger.
- [x] 1.3 Add RLS policies (anon read on public tables, auth read on runs, admin writes).
- [x] 1.4 Add seed data for the `seeds-poc` model line.

## 2. Edge Functions

- [x] 2.1 Implement `resolve-channel` (update / noop / rebuild_required branches).
- [x] 2.2 Implement `upload-artifact` with admin check and R2 signed PUT.

## 3. Tests

- [x] 3.1 SQL tests for schema, RLS, and compat signature.
- [x] 3.2 Deno tests for both Edge Functions.
- [x] 3.3 GitHub Actions workflow runs all of the above.

## 4. Validation

- [x] 4.1 Run `openspec validate --all --strict`.
- [x] 4.2 Smoke test: `curl /resolve-channel` against a seeded local stack.
