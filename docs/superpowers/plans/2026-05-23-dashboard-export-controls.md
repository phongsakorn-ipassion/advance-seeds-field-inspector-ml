# Dashboard Export Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin operators set per-platform `max_det`, `iou`, `conf` (and keep the existing `quantize`) for every training run via the registry dashboard at `https://phongsakorn-ipassion.github.io/advance-seeds-field-inspector-ml/`, so the Colab export path produces `.mlpackage` / `.tflite` artifacts whose NMS head returns more than one detection per frame.

**Architecture:** Extend `ExportTarget` with an optional `nms` block from UI → store → `runs.config_yaml.exportOptions.nms` JSONB → `start-training` Edge Function validation → `train_for_run.py` reads + injects into Ultralytics `model.export(...)` kwargs. Defaults live in **one** place (`registry/types.ts` + Python `DEFAULT_EXPORT_OPTIONS`) and are mirrored verbatim. Existing `training-callback` propagates the resolved options into version metadata for QA/debug. The hosted-Modal path (`runner.py` + `train_yolo26n_seg.py`) does **not** export today — it is left untouched and remediation is deferred to a follow-up plan.

**Tech Stack:** React 19 + Vite 6 + TypeScript (apps/web), Vitest, Supabase Edge Functions (Deno), Python 3.10+ (scripts/, ultralytics), JSONB on Postgres, OpenSpec.

**Branch discipline:** all work on `dev`. Never touch `main`, never `git push`, never `modal deploy`, never trigger Modal, never promote channels.

---

## Scope guardrails

In scope:
- UI controls + validation in `apps/web/src/App.tsx::TrainWorkflow`
- Type contract in `apps/web/src/registry/types.ts`
- Read/write pipes in `apps/web/src/registry/supabaseStore.ts` + `demoStore.ts`
- Edge Function validation in `supabase/functions/start-training/index.ts`
- Metadata propagation in `supabase/functions/training-callback/index.ts`
- Python read + apply in `scripts/train_for_run.py`
- Mirror in `scripts/export_mobile_model_candidates.py` (local export path)
- OpenSpec change `add-dashboard-export-nms-controls/`
- Vitest + Python unittest coverage

Out of scope (explicitly):
- Do not touch the `model_export_contract.json` `output_kind`/`output_shape` — the demo app's `TfliteSeedAnalyzer.ts:163` classifies `shape[2] === 6` as `nms` and only reconstructs masks when `shape[2] > 6`. Reconciling to `[1,300,6]` would silently break the segmentation overlay. Defer head-shape work to Phase 3.
- Do not touch the hosted-Modal worker (`packages/training-worker/src/advance_seeds_training_worker/runner.py`) or `scripts/train_yolo26n_seg.py`. Both today fail to produce mobile artifacts independently; that is its own bug and gets its own plan.
- Do not touch demo-repo native modules — `dde6335` on demo `dev` already surfaced the proto tensor on the still-image path.
- Do not migrate Supabase schema. `runs.config_yaml` is `jsonb` and accepts arbitrary nested shape.

---

## File structure (locked before tasks)

| File | Responsibility | Action |
|---|---|---|
| `apps/web/src/registry/types.ts` | Shared TS types between dashboard + stores | **Modify** — add `ExportNms`, extend `ExportTarget`, export `DEFAULT_EXPORT_NMS` constant |
| `apps/web/src/registry/exportOptions.ts` | New helper module — clamp/sanitize export options on read and on write | **Create** — single source of truth for default merging + clamping (used by both stores + UI) |
| `apps/web/src/registry/exportOptions.test.ts` | Vitest coverage for clamp + merge | **Create** |
| `apps/web/src/registry/supabaseStore.ts` | Supabase read path (`exportOptionsFrom`) + write paths (`insertLocalRun`, `startTraining`) | **Modify** — call new helper, persist `nms` |
| `apps/web/src/registry/supabaseStore.test.ts` | Existing vitest file | **Modify** — extend `exportOptionsFrom` coverage |
| `apps/web/src/registry/demoStore.ts` | In-memory demo path mirrored to supabase shape | **Modify** — accept + emit `nms` |
| `apps/web/src/registry/demoStore.test.ts` | Existing vitest file | **Modify** — assert `nms` round-trip |
| `apps/web/src/App.tsx` | `TrainWorkflow` form, useState default, UI controls, summary chips | **Modify** — add Detection limits block under Quantization (always visible, mirrors quantize layout) |
| `apps/web/src/styles.css` | UI styling | **Modify** — add `.export-nms-row` + `.export-nms-summary` classes; reuse existing tokens |
| `supabase/functions/start-training/index.ts` | Server-side validation of run config before insert + dispatch | **Modify** — assert `exportOptions.{ios,android}.nms.{maxDet,iouThreshold,confThreshold}` ranges if present; reject 400 on out-of-range |
| `supabase/functions/_shared/exportOptions.ts` | New shared TS validator used by start-training and training-callback | **Create** — Deno-compatible pure validator matching `apps/web/src/registry/exportOptions.ts` defaults |
| `supabase/functions/training-callback/index.ts` | Writes resolved options into version metadata | **Modify** — surface `exportOptions.nms` in `metadata.export_options` on version row |
| `scripts/train_for_run.py` | Colab path: reads run config, trains, exports, uploads | **Modify** — `DEFAULT_EXPORT_OPTIONS` adds `nms`, `load_export_options` reads `nms.*`, `export_kwargs` passes `nms`/`max_det`/`iou`/`conf` to Ultralytics |
| `scripts/export_mobile_model_candidates.py` | Local-export CLI used outside Colab | **Modify** — add `--max-det`, `--iou`, `--conf` flags with the same defaults |
| `tests/test_train_for_run_exports.py` | Existing python unittest | **Modify** — add tests for NMS kwargs in both coreml + tflite, default + override |
| `openspec/changes/add-dashboard-export-nms-controls/proposal.md` | Change proposal | **Create** |
| `openspec/changes/add-dashboard-export-nms-controls/design.md` | Design notes (UI mock + flow diagram + defaults rationale) | **Create** |
| `openspec/changes/add-dashboard-export-nms-controls/tasks.md` | Task checklist mirroring this plan | **Create** |
| `openspec/changes/add-dashboard-export-nms-controls/specs/model-registry-web-dashboard/spec.md` | Spec delta | **Create** |
| `openspec/changes/add-dashboard-export-nms-controls/specs/mobile-model-export/spec.md` | Spec delta | **Create** |

---

## Default values (single source of truth)

These constants MUST be identical in:
- `apps/web/src/registry/types.ts` (`DEFAULT_EXPORT_NMS`)
- `supabase/functions/_shared/exportOptions.ts`
- `scripts/train_for_run.py` (`DEFAULT_EXPORT_OPTIONS["ios"]["nms"]`, same for `android`)

```ts
const DEFAULT_EXPORT_NMS = {
  maxDet: 300,         // Ultralytics upper bound for NMS-fused head
  iouThreshold: 0.7,   // matches Ultralytics' default; safer than the original 0.85 idea per Codex review
  confThreshold: 0.25, // matches demo app fallback in yolo.ts:90
};
```

**Ranges enforced everywhere:**
- `maxDet`: integer, `1 ≤ x ≤ 300`
- `iouThreshold`: number, `0.0 ≤ x ≤ 1.0`, step 0.05
- `confThreshold`: number, `0.0 ≤ x ≤ 1.0`, step 0.05

`iou=0.7` is chosen instead of the originally-floated `0.85` because Codex flagged that the demo app's registry fallback is `0.45` and `0.85` had not been QA'd. `0.7` is the Ultralytics export default and matches what the current production model was implicitly trained against.

---

## Task 1: OpenSpec proposal scaffold

**Files:**
- Create: `openspec/changes/add-dashboard-export-nms-controls/proposal.md`
- Create: `openspec/changes/add-dashboard-export-nms-controls/design.md`
- Create: `openspec/changes/add-dashboard-export-nms-controls/tasks.md`
- Create: `openspec/changes/add-dashboard-export-nms-controls/specs/model-registry-web-dashboard/spec.md`
- Create: `openspec/changes/add-dashboard-export-nms-controls/specs/mobile-model-export/spec.md`

- [ ] **Step 1: Read existing spec files for delta format**

Run: `ls openspec/specs/model-registry-web-dashboard/ openspec/specs/mobile-model-export/ && head -60 openspec/specs/model-registry-web-dashboard/spec.md`

Use that pattern for the delta files in Step 3.

- [ ] **Step 2: Write `proposal.md`**

```markdown
# add-dashboard-export-nms-controls

## Why
The iOS Core ML and Android TFLite artifacts shipped today only return one
detection per frame because `scripts/train_for_run.py::export_kwargs` does
not pass `nms / max_det / iou / conf` to Ultralytics' `model.export(...)`.
Operators cannot fix this from the dashboard; the only knob exposed is
`quantize` per platform. We need first-class NMS controls.

## What changes
- Dashboard "Train new model" form gains a Detection limits block per
  platform: `max_det`, `iou`, `conf`. Always visible (mirrors Quantization),
  with summary chips and a Reset-to-defaults action.
- `ExportTarget` type gains an optional `nms` block.
- `start-training` Edge Function validates the new fields before insert.
- `training-callback` Edge Function surfaces resolved options in version
  metadata.
- `scripts/train_for_run.py::export_kwargs` injects NMS params into both
  Core ML and TFLite export kwargs.
- `scripts/export_mobile_model_candidates.py` accepts matching CLI flags.

## Impact
- New: `apps/web/src/registry/exportOptions.ts`,
  `supabase/functions/_shared/exportOptions.ts`,
  `openspec/changes/add-dashboard-export-nms-controls/*`
- Modified: web registry types/stores/UI/CSS, both Edge Functions, two
  Python scripts, Python + Vitest test files.
- Not impacted: artifact filename contract, `model_export_contract.json`
  output_kind/shape (deferred), demo repo, hosted-Modal worker (separate
  bug).
```

- [ ] **Step 3: Write `design.md`**

```markdown
# Design — Dashboard export NMS controls

## Defaults (locked across web + Edge + Python)
- maxDet=300, iouThreshold=0.7, confThreshold=0.25
- Ranges: maxDet ∈ [1,300] int; iou/conf ∈ [0.0,1.0] step 0.05

## UI layout
Below the existing "Quantization" checkbox-group, add a sibling block
"Detection limits". Per platform (iOS, Android) render three labelled
number inputs in one row plus a summary chip beneath that reads
"maxDet=300 · iou=0.70 · conf=0.25" using the same `quantization-option-meta`
typography. A "Reset to defaults" ghost button sits at the right of each
platform row. The whole block is always visible (NOT collapsed) because
the controls materially affect on-device detection behaviour.

## Persistence shape
`runs.config_yaml.exportOptions = { ios: {quantize, nms: {maxDet, iouThreshold, confThreshold}}, android: {...} }`.
`nms` is optional on read; missing `nms` means "use defaults".

## Validation
Done on three layers, all using the same constants from
`_shared/exportOptions.ts`:
1. UI: type=number + min/max/step; error label on blur if out of range.
2. start-training Edge Function: 400 with explicit field name if invalid.
3. Python loader: clamps + logs; never crashes the run.

## Metadata propagation
`training-callback` writes the resolved options into
`version.metadata.export_options` so QA can verify what was actually
sent to Ultralytics.

## Out of scope rationale
- `output_kind/output_shape` reconcile: would break demo decoder
  (`TfliteSeedAnalyzer.ts:163`). Deferred to a separate change that
  must touch the demo repo in lockstep.
- Modal hosted worker: `runner.py` calls `train_yolo26n_seg.py` which
  does not export. Production model came from the Colab path. Hosted
  path is broken independently; this plan keeps it untouched.
```

- [ ] **Step 4: Write `tasks.md`**

```markdown
# Tasks

- [ ] Extend `ExportTarget` type + add `DEFAULT_EXPORT_NMS` + create `exportOptions.ts` helper
- [ ] Update `exportOptionsFrom` + write paths in `supabaseStore.ts`
- [ ] Update `demoStore.ts` read/write paths
- [ ] Vitest: exportOptions helper + store round-trip
- [ ] Add Detection limits UI block + CSS + summary chips
- [ ] Create `_shared/exportOptions.ts` validator (Deno)
- [ ] Add validation to `start-training/index.ts`
- [ ] Add metadata propagation to `training-callback/index.ts`
- [ ] Update `DEFAULT_EXPORT_OPTIONS`, `load_export_options`, `export_kwargs` in `train_for_run.py`
- [ ] Add `--max-det / --iou / --conf` flags to `export_mobile_model_candidates.py`
- [ ] Extend `tests/test_train_for_run_exports.py`
- [ ] `openspec validate --all --strict`
- [ ] Update root CLAUDE.md mention if needed
```

- [ ] **Step 5: Write spec deltas**

`openspec/changes/add-dashboard-export-nms-controls/specs/model-registry-web-dashboard/spec.md`:
```markdown
## ADDED Requirements

### Requirement: Detection limit controls on training form

The training form SHALL expose `max_det`, `iou`, and `conf` controls per
platform (iOS, Android) alongside the existing Quantization controls,
defaulting to maxDet=300 / iou=0.7 / conf=0.25. The controls SHALL be
always visible (not collapsed) and SHALL surface a summary chip below the
inputs and a Reset-to-defaults action.

#### Scenario: Operator overrides max_det

- **GIVEN** an admin opens the Train workflow
- **WHEN** they set iOS maxDet to 150
- **THEN** the form persists `exportOptions.ios.nms.maxDet=150` on the
  resulting run row and the summary chip reflects the new value.

#### Scenario: Out-of-range input is rejected

- **GIVEN** an admin types `iou=2.0`
- **WHEN** they submit the form
- **THEN** the form surfaces a field error and does NOT dispatch the run.
```

`openspec/changes/add-dashboard-export-nms-controls/specs/mobile-model-export/spec.md`:
```markdown
## ADDED Requirements

### Requirement: Configurable NMS parameters in mobile export

The training pipeline SHALL forward `max_det`, `iou`, and `conf` from
`run.config_yaml.exportOptions` into Ultralytics' `model.export(format="coreml"|"tflite", nms=True, max_det=..., iou=..., conf=...)`.

#### Scenario: Operator-configured max_det reaches Ultralytics

- **GIVEN** a run row has `exportOptions.ios.nms.maxDet=200`
- **WHEN** the Colab worker runs `train_for_run.py::export_kwargs("coreml", config, ...)`
- **THEN** the returned dict contains `nms=True`, `max_det=200`,
  `iou=0.7`, `conf=0.25`.

#### Scenario: Missing exportOptions falls back to defaults

- **GIVEN** a legacy run row without `exportOptions.nms`
- **WHEN** the worker resolves export kwargs
- **THEN** the returned dict contains `max_det=300`, `iou=0.7`,
  `conf=0.25`.
```

- [ ] **Step 6: Validate scaffold**

Run: `openspec validate add-dashboard-export-nms-controls --strict`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add openspec/changes/add-dashboard-export-nms-controls
git commit -m "spec: propose dashboard export NMS controls"
```

---

## Task 2: Type contract + shared helper

**Files:**
- Modify: `apps/web/src/registry/types.ts` (around L30)
- Create: `apps/web/src/registry/exportOptions.ts`
- Create: `apps/web/src/registry/exportOptions.test.ts`

- [ ] **Step 1: Write failing tests** in `exportOptions.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_EXPORT_NMS, sanitizeExportOptions } from "./exportOptions";

describe("sanitizeExportOptions", () => {
  it("returns defaults when input is undefined", () => {
    expect(sanitizeExportOptions(undefined)).toEqual({
      ios: { quantize: true, nms: DEFAULT_EXPORT_NMS },
      android: { quantize: true, nms: DEFAULT_EXPORT_NMS },
    });
  });

  it("preserves quantize and clamps out-of-range NMS values", () => {
    const result = sanitizeExportOptions({
      ios: { quantize: false, nms: { maxDet: 9999, iouThreshold: 2, confThreshold: -1 } },
      android: { quantize: true, nms: { maxDet: 0, iouThreshold: 0.5, confThreshold: 0.5 } },
    });
    expect(result.ios.quantize).toBe(false);
    expect(result.ios.nms).toEqual({ maxDet: 300, iouThreshold: 1, confThreshold: 0 });
    expect(result.android.nms).toEqual({ maxDet: 1, iouThreshold: 0.5, confThreshold: 0.5 });
  });

  it("rounds maxDet to nearest integer", () => {
    const result = sanitizeExportOptions({
      ios: { quantize: true, nms: { maxDet: 150.7, iouThreshold: 0.5, confThreshold: 0.5 } },
      android: { quantize: true },
    });
    expect(result.ios.nms.maxDet).toBe(151);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm -F advance-seeds-model-registry-web test -- exportOptions`
Expected: FAIL — module not found.

- [ ] **Step 3: Update `types.ts`**

Replace L30-35 block:
```ts
export type ExportNms = {
  maxDet: number;
  iouThreshold: number;
  confThreshold: number;
};

export type ExportTarget = {
  quantize: boolean;
  nms?: ExportNms;
};

export type ExportOptions = {
  ios: ExportTarget;
  android: ExportTarget;
};
```

- [ ] **Step 4: Implement `exportOptions.ts`**

```ts
import type { ExportNms, ExportOptions, ExportTarget } from "./types";

export const DEFAULT_EXPORT_NMS: ExportNms = {
  maxDet: 300,
  iouThreshold: 0.7,
  confThreshold: 0.25,
};

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  ios: { quantize: true, nms: DEFAULT_EXPORT_NMS },
  android: { quantize: true, nms: DEFAULT_EXPORT_NMS },
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

function sanitizeNms(value: unknown): ExportNms {
  if (!value || typeof value !== "object") return DEFAULT_EXPORT_NMS;
  const v = value as Record<string, unknown>;
  const maxDet = typeof v.maxDet === "number" && Number.isFinite(v.maxDet)
    ? clamp(Math.round(v.maxDet), 1, 300)
    : DEFAULT_EXPORT_NMS.maxDet;
  const iouThreshold = typeof v.iouThreshold === "number" && Number.isFinite(v.iouThreshold)
    ? clamp(v.iouThreshold, 0, 1)
    : DEFAULT_EXPORT_NMS.iouThreshold;
  const confThreshold = typeof v.confThreshold === "number" && Number.isFinite(v.confThreshold)
    ? clamp(v.confThreshold, 0, 1)
    : DEFAULT_EXPORT_NMS.confThreshold;
  return { maxDet, iouThreshold, confThreshold };
}

function sanitizeTarget(value: unknown): ExportTarget {
  if (!value || typeof value !== "object") {
    return { quantize: true, nms: DEFAULT_EXPORT_NMS };
  }
  const v = value as Record<string, unknown>;
  return {
    quantize: typeof v.quantize === "boolean" ? v.quantize : true,
    nms: sanitizeNms(v.nms),
  };
}

export function sanitizeExportOptions(value: unknown): ExportOptions {
  if (!value || typeof value !== "object") return DEFAULT_EXPORT_OPTIONS;
  const v = value as Record<string, unknown>;
  return { ios: sanitizeTarget(v.ios), android: sanitizeTarget(v.android) };
}

export function isNmsAtDefault(target: ExportTarget): boolean {
  const nms = target.nms ?? DEFAULT_EXPORT_NMS;
  return nms.maxDet === DEFAULT_EXPORT_NMS.maxDet
    && nms.iouThreshold === DEFAULT_EXPORT_NMS.iouThreshold
    && nms.confThreshold === DEFAULT_EXPORT_NMS.confThreshold;
}
```

- [ ] **Step 5: Re-run tests**

Run: `pnpm -F advance-seeds-model-registry-web test -- exportOptions`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm -F advance-seeds-model-registry-web build`
Expected: tsc passes; vite build may fail on unused imports — fix any.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/registry/types.ts apps/web/src/registry/exportOptions.ts apps/web/src/registry/exportOptions.test.ts
git commit -m "feat(web): add ExportNms type and sanitize helper"
```

---

## Task 3: Wire NMS through Supabase + demo stores

**Files:**
- Modify: `apps/web/src/registry/supabaseStore.ts:51-70` (`exportOptionsFrom`)
- Modify: `apps/web/src/registry/supabaseStore.ts:519-540` (`insertLocalRun`)
- Modify: `apps/web/src/registry/supabaseStore.ts:589-605` (`startTraining`)
- Modify: `apps/web/src/registry/demoStore.ts` (`startTraining` around L471 + any read helpers)
- Modify: `apps/web/src/registry/supabaseStore.test.ts`
- Modify: `apps/web/src/registry/demoStore.test.ts`

- [ ] **Step 1: Extend `supabaseStore.test.ts`** — add an `it` block:

```ts
it("preserves nms block on round trip", () => {
  const input = {
    ios: { quantize: false, nms: { maxDet: 150, iouThreshold: 0.6, confThreshold: 0.3 } },
    android: { quantize: true },
  };
  const out = exportOptionsFrom(input);
  expect(out?.ios.quantize).toBe(false);
  expect(out?.ios.nms).toEqual({ maxDet: 150, iouThreshold: 0.6, confThreshold: 0.3 });
  // Android missing nms → store helper should NOT fabricate a default;
  // sanitizeExportOptions is the consumer's job at use site.
  expect(out?.android.nms).toBeUndefined();
});
```

- [ ] **Step 2: Run tests — verify failure**

Run: `pnpm -F advance-seeds-model-registry-web test -- supabaseStore`
Expected: FAIL — `out.ios.nms` is undefined.

- [ ] **Step 3: Replace `exportOptionsFrom`** (L51) with:

```ts
export function exportOptionsFrom(value: unknown): ExportOptions | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const result: ExportOptions = {
    ios: { quantize: true },
    android: { quantize: true },
  };
  let hasRecordedChoice = false;
  for (const platform of ["ios", "android"] as const) {
    const entry = source[platform];
    if (entry && typeof entry === "object") {
      const target = entry as Record<string, unknown>;
      const quantize = target.quantize;
      if (typeof quantize === "boolean") {
        result[platform].quantize = quantize;
        hasRecordedChoice = true;
      }
      const nms = target.nms;
      if (nms && typeof nms === "object") {
        const n = nms as Record<string, unknown>;
        const maxDet = typeof n.maxDet === "number" && Number.isFinite(n.maxDet) ? n.maxDet : undefined;
        const iouThreshold = typeof n.iouThreshold === "number" && Number.isFinite(n.iouThreshold) ? n.iouThreshold : undefined;
        const confThreshold = typeof n.confThreshold === "number" && Number.isFinite(n.confThreshold) ? n.confThreshold : undefined;
        if (maxDet !== undefined && iouThreshold !== undefined && confThreshold !== undefined) {
          result[platform].nms = { maxDet, iouThreshold, confThreshold };
          hasRecordedChoice = true;
        }
      }
    }
  }
  return hasRecordedChoice ? result : undefined;
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `pnpm -F advance-seeds-model-registry-web test -- supabaseStore`
Expected: PASS.

- [ ] **Step 5: Write paths already correct** — `insertLocalRun` (L533) and `startTraining` (L601) already spread `exportOptions: config.exportOptions`, which now carries `nms` for free. No change needed; verify by reading the file.

Run: `grep -n "exportOptions: config.exportOptions" apps/web/src/registry/supabaseStore.ts`
Expected: 2 matches.

- [ ] **Step 6: Mirror in `demoStore.ts`** — extend its existing in-memory write to record `nms` (read the file at L460-480 first; the change is to pass `config.exportOptions` through unchanged into the stored snapshot row).

Likely the file already does this. If grep `exportOptions` shows direct pass-through, skip the file edit. Otherwise patch.

Run: `grep -n "exportOptions" apps/web/src/registry/demoStore.ts`

- [ ] **Step 7: Extend `demoStore.test.ts`** — assert that `startTraining` with a custom NMS payload yields a run row whose `config_yaml.exportOptions.ios.nms.maxDet` matches.

- [ ] **Step 8: Run all store tests**

Run: `pnpm -F advance-seeds-model-registry-web test -- store`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/registry/supabaseStore.ts apps/web/src/registry/supabaseStore.test.ts apps/web/src/registry/demoStore.ts apps/web/src/registry/demoStore.test.ts
git commit -m "feat(web): persist exportOptions.nms through registry stores"
```

---

## Task 4: UI — Detection limits block

**Files:**
- Modify: `apps/web/src/App.tsx:1157` (useState default)
- Modify: `apps/web/src/App.tsx:1396-1431` (form block — insert new block after Quantization)
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Update the `useState` default** at L1157:

```ts
import { DEFAULT_EXPORT_OPTIONS } from "../registry/exportOptions"; // add at imports
// ...
const [exportOptions, setExportOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
```

- [ ] **Step 2: Add validation helper near `validateTrainingConfig`** (around L1192):

```ts
function validateExportOptions(): string[] {
  const errors: string[] = [];
  for (const platform of ["ios", "android"] as const) {
    const nms = exportOptions[platform].nms;
    if (!nms) continue;
    if (!Number.isInteger(nms.maxDet) || nms.maxDet < 1 || nms.maxDet > 300) {
      errors.push(`${platform.toUpperCase()} maxDet must be an integer between 1 and 300.`);
    }
    if (!(nms.iouThreshold >= 0 && nms.iouThreshold <= 1)) {
      errors.push(`${platform.toUpperCase()} IoU must be between 0.0 and 1.0.`);
    }
    if (!(nms.confThreshold >= 0 && nms.confThreshold <= 1)) {
      errors.push(`${platform.toUpperCase()} confidence must be between 0.0 and 1.0.`);
    }
  }
  return errors;
}
```

Then in the submit handler (L1267) add:
```ts
const optionErrors = validateExportOptions();
if (optionErrors.length > 0) {
  setStartError(optionErrors.join(" "));
  return;
}
```

- [ ] **Step 3: Insert the Detection limits block** after L1431 (after `</div>` closing `checkbox-group` and before the submit button):

```tsx
<div className="export-nms-field">
  <span className="label-text">
    Detection limits
    <Hint text="NMS parameters passed to Ultralytics during mobile export. maxDet caps detections per frame; iou is the NMS overlap threshold; conf is the minimum confidence." />
  </span>
  {(["ios", "android"] as const).map((platform) => {
    const nms = exportOptions[platform].nms ?? DEFAULT_EXPORT_NMS;
    const update = (next: Partial<typeof nms>) =>
      setExportOptions(prev => ({
        ...prev,
        [platform]: { ...prev[platform], nms: { ...nms, ...next } },
      }));
    return (
      <div key={platform} className="export-nms-row">
        <span className="export-nms-platform">{platform.toUpperCase()}</span>
        <label>
          <span className="export-nms-label">maxDet</span>
          <input
            type="number"
            min={1}
            max={300}
            step={1}
            value={nms.maxDet}
            onChange={(e) => update({ maxDet: Math.round(Number(e.target.value)) })}
            disabled={!isAdmin}
          />
        </label>
        <label>
          <span className="export-nms-label">IoU</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={nms.iouThreshold}
            onChange={(e) => update({ iouThreshold: Number(e.target.value) })}
            disabled={!isAdmin}
          />
        </label>
        <label>
          <span className="export-nms-label">Conf</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={nms.confThreshold}
            onChange={(e) => update({ confThreshold: Number(e.target.value) })}
            disabled={!isAdmin}
          />
        </label>
        <button
          type="button"
          className="ghost-button compact"
          onClick={() => update(DEFAULT_EXPORT_NMS)}
          disabled={!isAdmin}
        >
          Reset
        </button>
        <span className="export-nms-summary">
          maxDet={nms.maxDet} · iou={nms.iouThreshold.toFixed(2)} · conf={nms.confThreshold.toFixed(2)}
        </span>
      </div>
    );
  })}
</div>
```

(Add the import for `DEFAULT_EXPORT_NMS` alongside `DEFAULT_EXPORT_OPTIONS`.)

- [ ] **Step 4: Add CSS** at the end of `apps/web/src/styles.css`:

```css
.export-nms-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.export-nms-row {
  display: grid;
  grid-template-columns: 56px repeat(3, minmax(80px, 1fr)) auto;
  align-items: end;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}
.export-nms-row > label {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.export-nms-platform {
  font-weight: 600;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.export-nms-label {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.export-nms-summary {
  grid-column: 1 / -1;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}
```

(If the listed CSS variables don't all exist, substitute the closest existing token by grepping `styles.css` first; the design tokens approach is mandatory per repo CLAUDE.md.)

- [ ] **Step 5: Manual smoke**

Run: `pnpm -F advance-seeds-model-registry-web dev`
Open: `http://127.0.0.1:5173`
Verify: Train tab shows the new block; values update; Reset button restores defaults; submitting with `iou=2` produces a form error; submitting with valid values dispatches.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/styles.css
git commit -m "feat(web): add detection limits controls to train form"
```

---

## Task 5: Edge Function validation + metadata propagation

**Files:**
- Create: `supabase/functions/_shared/exportOptions.ts`
- Modify: `supabase/functions/start-training/index.ts:20-28`
- Modify: `supabase/functions/training-callback/index.ts` (around L70-90 — confirm exact line by `grep -n "export_options\|exportOptions" supabase/functions/training-callback/index.ts`)

- [ ] **Step 1: Create the shared validator** at `supabase/functions/_shared/exportOptions.ts`:

```ts
export const DEFAULT_EXPORT_NMS = {
  maxDet: 300,
  iouThreshold: 0.7,
  confThreshold: 0.25,
} as const;

export type ExportNms = { maxDet: number; iouThreshold: number; confThreshold: number };
export type ExportTarget = { quantize: boolean; nms?: ExportNms };
export type ExportOptions = { ios: ExportTarget; android: ExportTarget };

export type ValidationError = { field: string; message: string };

const PLATFORMS = ["ios", "android"] as const;

export function validateExportOptions(value: unknown): { ok: true; value: ExportOptions } | { ok: false; errors: ValidationError[] } {
  if (value === undefined || value === null) {
    return { ok: true, value: { ios: { quantize: true }, android: { quantize: true } } };
  }
  if (typeof value !== "object") {
    return { ok: false, errors: [{ field: "exportOptions", message: "must be an object" }] };
  }
  const errors: ValidationError[] = [];
  const src = value as Record<string, unknown>;
  const out: ExportOptions = { ios: { quantize: true }, android: { quantize: true } };
  for (const platform of PLATFORMS) {
    const entry = src[platform];
    if (entry === undefined) continue;
    if (!entry || typeof entry !== "object") {
      errors.push({ field: `exportOptions.${platform}`, message: "must be an object" });
      continue;
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.quantize === "boolean") out[platform].quantize = e.quantize;
    const nmsRaw = e.nms;
    if (nmsRaw === undefined) continue;
    if (!nmsRaw || typeof nmsRaw !== "object") {
      errors.push({ field: `exportOptions.${platform}.nms`, message: "must be an object" });
      continue;
    }
    const n = nmsRaw as Record<string, unknown>;
    const { maxDet, iouThreshold, confThreshold } = n;
    if (typeof maxDet !== "number" || !Number.isInteger(maxDet) || maxDet < 1 || maxDet > 300) {
      errors.push({ field: `exportOptions.${platform}.nms.maxDet`, message: "must be an integer in [1, 300]" });
      continue;
    }
    if (typeof iouThreshold !== "number" || !Number.isFinite(iouThreshold) || iouThreshold < 0 || iouThreshold > 1) {
      errors.push({ field: `exportOptions.${platform}.nms.iouThreshold`, message: "must be a number in [0, 1]" });
      continue;
    }
    if (typeof confThreshold !== "number" || !Number.isFinite(confThreshold) || confThreshold < 0 || confThreshold > 1) {
      errors.push({ field: `exportOptions.${platform}.nms.confThreshold`, message: "must be a number in [0, 1]" });
      continue;
    }
    out[platform].nms = { maxDet, iouThreshold, confThreshold };
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: out };
}
```

- [ ] **Step 2: Wire into `start-training/index.ts`** — between L26 and L29 (after the JSON shape check, before the model_lines lookup):

```ts
import { validateExportOptions } from "../_shared/exportOptions.ts";
// ...
const exportOptionsCheck = validateExportOptions((body.config as Record<string, unknown>).exportOptions);
if (!exportOptionsCheck.ok) {
  return json({ error: "invalid_export_options", details: exportOptionsCheck.errors }, 400);
}
```

- [ ] **Step 3: Surface `export_options` in `training-callback`**

Grep first: `grep -n "metadata\|export_options" supabase/functions/training-callback/index.ts | head -20`

Then in the metadata-construction block, ensure `metadata.export_options = validatedOptions` is included, pulling the run's stored `config_yaml.exportOptions` from the existing run row read. If the file already includes it (per Codex's "L77 reads export options"), confirm the new `nms` block survives the round trip and is not flattened.

- [ ] **Step 4: Add a Deno test** under `supabase/tests/`:

Run: `ls supabase/tests/ && cat supabase/tests/$(ls supabase/tests/ | head -1) | head -40` to mirror style, then add `export_options_validator_test.ts` covering ok / out-of-range / non-object.

Run: `supabase functions test --env-file supabase/.env.local` (or whatever the repo's invocation is; if unsure, defer to a follow-up — Python tests still cover the load path).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/exportOptions.ts supabase/functions/start-training/index.ts supabase/functions/training-callback/index.ts supabase/tests
git commit -m "feat(edge): validate exportOptions.nms and propagate to metadata"
```

---

## Task 6: Python — read + apply NMS kwargs

**Files:**
- Modify: `scripts/train_for_run.py:49-98` (`DEFAULT_EXPORT_OPTIONS`, `load_export_options`, `export_kwargs`)
- Modify: `tests/test_train_for_run_exports.py`

- [ ] **Step 1: Write failing tests** — append to `tests/test_train_for_run_exports.py`:

```python
def test_coreml_export_includes_default_nms(self):
    config = {"data": "/tmp/dataset.yaml", "imgsz": 640}
    kwargs = self.module.export_kwargs("coreml", config, True)  # quantize=True
    self.assertTrue(kwargs["nms"])
    self.assertEqual(kwargs["max_det"], 300)
    self.assertAlmostEqual(kwargs["iou"], 0.7)
    self.assertAlmostEqual(kwargs["conf"], 0.25)

def test_coreml_export_honours_run_overrides(self):
    config = {
        "data": "/tmp/dataset.yaml",
        "imgsz": 640,
        "exportOptions": {
            "ios": {"quantize": False, "nms": {"maxDet": 150, "iouThreshold": 0.55, "confThreshold": 0.3}},
            "android": {"quantize": True},
        },
    }
    resolved = self.module.load_export_options(config)
    kwargs = self.module.export_kwargs("coreml", config, resolved["ios"]["quantize"], resolved["ios"]["nms"])
    self.assertEqual(kwargs["max_det"], 150)
    self.assertAlmostEqual(kwargs["iou"], 0.55)
    self.assertAlmostEqual(kwargs["conf"], 0.3)
    self.assertNotIn("half", kwargs)  # quantize=False

def test_tflite_export_includes_nms(self):
    config = {"data": "/tmp/dataset.yaml", "imgsz": 640}
    kwargs = self.module.export_kwargs("tflite", config, False)
    self.assertTrue(kwargs["nms"])
    self.assertEqual(kwargs["max_det"], 300)

def test_load_export_options_clamps_out_of_range(self):
    config = {"exportOptions": {"ios": {"quantize": True, "nms": {"maxDet": 9999, "iouThreshold": 2, "confThreshold": -1}}, "android": {"quantize": True}}}
    resolved = self.module.load_export_options(config)
    self.assertEqual(resolved["ios"]["nms"]["maxDet"], 300)
    self.assertEqual(resolved["ios"]["nms"]["iouThreshold"], 1.0)
    self.assertEqual(resolved["ios"]["nms"]["confThreshold"], 0.0)
```

(Note: `export_kwargs` will now take an optional `nms` dict as a 4th positional arg. Older tests at L21-54 use the 3-arg form with an env-dict — those appear to be pre-existing and not aligned with the current signature in `train_for_run.py`. Verify by running the file as-is once, then update the older tests to match the actual current signature or leave them as-is if they're already failing on `main`.)

- [ ] **Step 2: Run tests — verify failure**

Run: `python -m unittest tests.test_train_for_run_exports`
Expected: new tests FAIL; older tests' state is whatever it currently is (record it).

- [ ] **Step 3: Update `DEFAULT_EXPORT_OPTIONS`** at L49:

```python
DEFAULT_EXPORT_NMS = {"maxDet": 300, "iouThreshold": 0.7, "confThreshold": 0.25}
DEFAULT_EXPORT_OPTIONS = {
    "ios":     {"quantize": True, "nms": dict(DEFAULT_EXPORT_NMS)},
    "android": {"quantize": True, "nms": dict(DEFAULT_EXPORT_NMS)},
}
```

- [ ] **Step 4: Update `load_export_options`** at L55-71 to also normalize `nms`:

```python
def _clamp(value, lo, hi):
    return max(lo, min(hi, value))

def _resolve_nms(raw):
    if not isinstance(raw, dict):
        return dict(DEFAULT_EXPORT_NMS)
    max_det = raw.get("maxDet", DEFAULT_EXPORT_NMS["maxDet"])
    iou = raw.get("iouThreshold", DEFAULT_EXPORT_NMS["iouThreshold"])
    conf = raw.get("confThreshold", DEFAULT_EXPORT_NMS["confThreshold"])
    try:
        max_det = int(round(float(max_det)))
    except (TypeError, ValueError):
        max_det = DEFAULT_EXPORT_NMS["maxDet"]
    try:
        iou = float(iou)
    except (TypeError, ValueError):
        iou = DEFAULT_EXPORT_NMS["iouThreshold"]
    try:
        conf = float(conf)
    except (TypeError, ValueError):
        conf = DEFAULT_EXPORT_NMS["confThreshold"]
    return {
        "maxDet": int(_clamp(max_det, 1, 300)),
        "iouThreshold": float(_clamp(iou, 0.0, 1.0)),
        "confThreshold": float(_clamp(conf, 0.0, 1.0)),
    }

def load_export_options(run_config: dict) -> dict:
    raw = (
        run_config.get("exportOptions")
        or run_config.get("export_options")
    ) if isinstance(run_config, dict) else None
    result = {k: {"quantize": v["quantize"], "nms": dict(v["nms"])} for k, v in DEFAULT_EXPORT_OPTIONS.items()}
    if not isinstance(raw, dict):
        return result
    for platform_key in ("ios", "android"):
        entry = raw.get(platform_key)
        if not isinstance(entry, dict):
            continue
        if isinstance(entry.get("quantize"), bool):
            result[platform_key]["quantize"] = entry["quantize"]
        if "nms" in entry:
            result[platform_key]["nms"] = _resolve_nms(entry.get("nms"))
    return result
```

- [ ] **Step 5: Update `export_kwargs`** at L74-98 to accept and emit `nms`:

```python
def export_kwargs(kind: str, config: dict, quantize: bool, nms: dict | None = None) -> dict:
    """Return Ultralytics export kwargs for mobile artifacts."""
    imgsz = int(config.get("imgsz", 640))
    nms_block = nms if nms is not None else dict(DEFAULT_EXPORT_NMS)
    common_nms = {
        "nms": True,
        "max_det": int(nms_block["maxDet"]),
        "iou": float(nms_block["iouThreshold"]),
        "conf": float(nms_block["confThreshold"]),
    }
    if kind == "tflite":
        if quantize:
            return {
                "format": "tflite",
                "int8": True,
                "data": str(config.get("data", "")),
                "imgsz": imgsz,
                "batch": 1,
                "fraction": _quant_fraction(os.environ),
                **common_nms,
            }
        return {"format": "tflite", "imgsz": imgsz, **common_nms}
    if kind == "coreml":
        if quantize:
            return {"format": "coreml", "half": True, "imgsz": imgsz, **common_nms}
        return {"format": "coreml", "imgsz": imgsz, **common_nms}
    raise ValueError(f"unsupported export kind: {kind}")
```

- [ ] **Step 6: Update call sites at L629 and L650** to pass the resolved `nms`:

```python
tflite_export_kwargs = export_kwargs("tflite", config, android_quantize, export_options["android"]["nms"])
# ...
coreml_export_kwargs = export_kwargs("coreml", config, ios_quantize, export_options["ios"]["nms"])
```

- [ ] **Step 7: Run tests**

Run: `python -m unittest tests.test_train_for_run_exports -v`
Expected: new tests PASS. If older tests now fail because their 3-arg pattern doesn't match (we kept backward compatibility — `nms` is optional), they should still pass. If they were already broken on `main`, leave them and flag for a separate cleanup.

- [ ] **Step 8: Commit**

```bash
git add scripts/train_for_run.py tests/test_train_for_run_exports.py
git commit -m "feat(training): pipe NMS kwargs through Colab export path"
```

---

## Task 7: Mirror in local export CLI

**Files:**
- Modify: `scripts/export_mobile_model_candidates.py`

- [ ] **Step 1: Read current argparse + export_model**

Run: `grep -n "argparse\|add_argument\|model.export\|def main\|def export_model" scripts/export_mobile_model_candidates.py`

- [ ] **Step 2: Add CLI flags** with the same defaults:

```python
parser.add_argument("--max-det", type=int, default=300, help="Ultralytics NMS max_det (1-300)")
parser.add_argument("--iou", type=float, default=0.7, help="Ultralytics NMS IoU threshold (0-1)")
parser.add_argument("--conf", type=float, default=0.25, help="Ultralytics NMS conf threshold (0-1)")
```

- [ ] **Step 3: Pass them into `model.export(...)`** kwargs alongside `format=coreml/tflite, imgsz, optimize` — add `nms=True, max_det=args.max_det, iou=args.iou, conf=args.conf`.

- [ ] **Step 4: Manual sanity (no real export, just argparse)**

Run: `python scripts/export_mobile_model_candidates.py --help`
Expected: new flags listed.

- [ ] **Step 5: Commit**

```bash
git add scripts/export_mobile_model_candidates.py
git commit -m "feat(scripts): accept NMS flags in mobile export CLI"
```

---

## Task 8: Final OpenSpec validation + sanity

- [ ] **Step 1: Validate**

Run: `openspec validate --all --strict`
Expected: PASS.

- [ ] **Step 2: Full test suites**

Run: `pnpm -F advance-seeds-model-registry-web test`
Run: `python -m unittest discover -s tests`
Expected: all PASS.

- [ ] **Step 3: Manual smoke through the UI** with local supabase if available:

Run: `pnpm -F advance-seeds-model-registry-web dev` and walk: open Train tab → set iOS maxDet=150 → submit → confirm the `runs.config_yaml.exportOptions.ios.nms.maxDet=150` via Studio.

- [ ] **Step 4: Final task-list update**

Mark task #1 in the Claude task list complete; task #3 (DBG probes) remains blocked on artifact verification once a real re-trained model lands.

---

## What this does NOT do (and why)

- **Does not trigger a re-train or re-export.** The operator has to push `dev` → branch (separate decision) and click "Train new model" in the dashboard. This plan only fixes the controls; it does not move artifacts.
- **Does not reconcile the export contract.** Touching `output_kind/output_shape` is a coordinated cross-repo change that needs demo-side decoder updates. Filed separately.
- **Does not fix the hosted-Modal worker.** `runner.py` calls a non-exporting script. Production model came from Colab. Hosted path needs its own plan.
- **Does not push or modify `main`.** All commits remain on local `dev`.

---

## Self-review

**Spec coverage:** All requirements in the proposal (`UI controls`, `validation`, `defaults`, `Python read+apply`) map to Tasks 2–7. Edge Function metadata propagation is Task 5. OpenSpec scaffold is Task 1.

**Placeholder scan:** Two soft spots remain:
- Task 5 Step 3 says "confirm exact line" — that is acceptable because Codex's review identified L77 but the file is subject to small drift. Grep first, then edit.
- Task 4 Step 4 CSS uses tokens (`--space-2`, etc.) that should exist; if any token is missing, substitute the nearest. This is design-token discipline per CLAUDE.md, not a placeholder.

**Type consistency:** `ExportNms { maxDet, iouThreshold, confThreshold }` is the camelCase shape used uniformly across `types.ts`, the validator, the UI, and the JSONB payload. Python uses the same camelCase keys when reading `runs.config_yaml.exportOptions` (Postgres JSONB preserves keys as-is). The Ultralytics export kwargs use the snake_case mapping `max_det / iou / conf` only inside `export_kwargs(...)`.
