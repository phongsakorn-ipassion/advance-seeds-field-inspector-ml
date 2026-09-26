## 1. QA workspace scaffold

- [x] 1.1 Scaffold `src/web-portal/` via `qa-init` (`qa.config.json`, `module.json`, `conftest.py`, `pytest.ini`)
- [x] 1.2 Build `sys_summary.md` (System Knowledge Base) from `apps/web` source

## 2. Page-object layer

- [x] 2.1 Build `components/`, `pages/`, `flows/` against the live demo-mode app
- [x] 2.2 Verify every selector against source (`App.tsx`) and empirically (`get_by_role(...).count()`), not just the system summary's paraphrase
- [x] 2.3 Write `tests/smoke/` (component-level static-fixture test + flow-level live test) as the page-object layer's own proof

## 3. Test cases

- [x] 3.1 Draft 21 test cases (schema 2.0) across AUTH/TRAIN/MODELS/STORAGE (`qa-draft`)
- [x] 3.2 Score drafts against the rubric — all four series 1.00/1.00 (`qa-eval`)
- [x] 3.3 Review and approve all 21 TCs (`qa-revise`)
- [x] 3.4 Compose `tests/test_*.py`, wire `script_ref`, advance to `ready` (`qa-plan`)

## 4. First full run and bug fix

- [x] 4.1 Run `qa-run-web` against demo mode — 19/21 pass, 1 fail (TRAIN-0003), 1 blocked (TRAIN-0006)
- [x] 4.2 Root-cause TRAIN-0003's fail: `parseYoloClasses()` regex swallows content past `names:` block
- [x] 4.3 Fix the regex in `apps/web/src/App.tsx`; verify against the fixture, the live app, and the full `vitest` suite
- [x] 4.4 Re-run `qa-run-web` for TRAIN-0003 — confirmed pass

## 5. Non-admin test account

- [x] 5.1 Add `demoReadOnly` to `apps/web/src/registry/demoStore.ts`
- [x] 5.2 Wire `role="readonly"` through `conftest.py`'s `login()` and `flows/auth_flow.py`
- [x] 5.3 Implement and wire TRAIN-0006, advance to `ready`
- [x] 5.4 Re-run `qa-run-web` — full suite 22/22 TCs, 46/46 steps pass

## 6. False-positive retraction

- [x] 6.1 Investigate the "sub-nav double-click breaks the run list" `known_bugs` entry with console instrumentation
- [x] 6.2 Root-cause as a Playwright click-stability artifact, not an app bug; revert instrumentation
- [x] 6.3 Retract the `known_bugs` entry and correct the misleading test comment

## 7. Reporting and spec sync

- [x] 7.1 Build the Excel reports (`qa-report`) — all 5 series, 100% pass
- [x] 7.2 Update `openspec/specs/model-registry-web-dashboard/spec.md` with the two modified requirements
- [x] 7.3 Run `openspec validate --all --strict`
