# Quantization Toggles & Step Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-run iOS/Android quantization toggles end-to-end and replace free-text training logs with structured per-step progress (6 notebook steps, 5 trainer sub-phases).

**Architecture:** Per-run choices live in `runs.config_yaml.exportOptions`. Trainer reads them (no more env vars). Disabled platforms produce a version row with `precision="skipped"` and null `r2_key`. Logs become structured `{ts, step, phase, status, message}` objects in `runs.config_yaml.logs[]`; notebook owns steps 2–4, trainer owns 5–6 (single-writer convention avoids races).

**Tech Stack:** Python (Ultralytics, urllib), Supabase Postgres + Edge Functions (Deno/TypeScript), React + TypeScript (Vite), Jupyter (Colab).

**Spec:** [docs/superpowers/specs/2026-05-21-quantization-toggles-and-step-logs-design.md](../specs/2026-05-21-quantization-toggles-and-step-logs-design.md)

---

## File map

| File | Action | Purpose |
|---|---|---|
| `apps/web/src/registry/types.ts` | Modify | Add `ExportOptions`, `RunLogEntry` union; widen precision strings. |
| `apps/web/src/App.tsx` | Modify | Start Training form toggles; Training Config card; Model Detail "skipped/failed" rendering; Run Logs panel with 6-step stepper. |
| `scripts/train_for_run.py` | Modify | `load_export_options`, `log_step`, guard exports, update metadata + create_version. |
| `notebooks/train_run.ipynb` | Modify | Remove env-var cells; add `log_step` helper; instrument cells 1/7/10. |
| `supabase/functions/list-deployed-models/index.ts` | Modify | Filter artifacts with `precision IN ('skipped','failed')` or null `r2_key`. |
| `supabase/functions/create-run/index.ts` (or whichever handler exists) | Modify | Reject runs with both platforms disabled. |
| `tests/scripts/test_train_for_run_exports.py` | Create | Unit tests for `load_export_options`, `log_step` shape, export gating. |
| `apps/web/src/registry/__tests__/runLogStepper.test.tsx` | Create | Stepper state transitions. |

---

## Task 1: Type updates for export options and structured logs

**Files:**
- Modify: `apps/web/src/registry/types.ts`

- [ ] **Step 1: Add new types and widen precision strings**

Open [apps/web/src/registry/types.ts](../../../apps/web/src/registry/types.ts) and add the following types near the top (after `MetricSummary`):

```typescript
export type PlatformPrecision = "int8" | "fp16" | "fp32" | "skipped" | "failed";

export type ExportTarget = {
  enabled: boolean;
  precision: "int8" | "fp16"; // user-selectable precisions only
};

export type ExportOptions = {
  ios: ExportTarget;     // default { enabled: true, precision: "fp16" }
  android: ExportTarget; // default { enabled: true, precision: "int8" }
};

export type RunLogStep = 1 | 2 | 3 | 4 | 5 | 6;
export type RunLogPhase = "dataset-ready" | "model-init" | "training" | "export" | "upload" | null;
export type RunLogStatus = "started" | "ok" | "error" | "info";

export type StructuredRunLogEntry = {
  ts: string;
  step: RunLogStep | null;
  phase: RunLogPhase;
  status: RunLogStatus;
  message: string;
};

export type RunLogEntry = string | StructuredRunLogEntry;
```

Then modify existing types:

```typescript
// In TrainConfig, add:
//   exportOptions?: ExportOptions;
//
// In RegistryRun, change:
//   logs: string[];
// to:
//   logs: RunLogEntry[];
//
// In RegistryVersion, change:
//   tflitePrecision?: string | null;
//   coremlPrecision?: string | null;
//   pytorchPrecision?: string | null;
// to:
//   tflitePrecision?: PlatformPrecision | null;
//   coremlPrecision?: PlatformPrecision | null;
//   pytorchPrecision?: PlatformPrecision | null;
```

- [ ] **Step 2: Type-check the web app**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS (any failures point to consumers that need updates — fix them inline in subsequent tasks; do not silence with `any`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/registry/types.ts
git commit -m "feat(types): add ExportOptions and structured RunLogEntry"
```

---

## Task 2: Trainer — `load_export_options` helper

**Files:**
- Modify: `scripts/train_for_run.py`
- Create: `tests/scripts/test_train_for_run_exports.py`

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/test_train_for_run_exports.py`:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))

from train_for_run import load_export_options


def test_defaults_when_missing():
    opts = load_export_options({})
    assert opts == {
        "ios": {"enabled": True, "precision": "fp16"},
        "android": {"enabled": True, "precision": "int8"},
    }


def test_reads_export_options_from_config():
    cfg = {
        "exportOptions": {
            "ios": {"enabled": False, "precision": "fp16"},
            "android": {"enabled": True, "precision": "int8"},
        }
    }
    opts = load_export_options(cfg)
    assert opts["ios"]["enabled"] is False
    assert opts["android"]["enabled"] is True


def test_legacy_run_uses_defaults():
    cfg = {"hyperparameters": {"epochs": 10}}  # no exportOptions
    opts = load_export_options(cfg)
    assert opts["ios"]["enabled"] is True
    assert opts["android"]["enabled"] is True


def test_invalid_shape_falls_back_to_defaults():
    cfg = {"exportOptions": "not-a-dict"}
    opts = load_export_options(cfg)
    assert opts["ios"]["enabled"] is True
```

- [ ] **Step 2: Run and verify failure**

Run: `pytest tests/scripts/test_train_for_run_exports.py -v`
Expected: FAIL with `ImportError: cannot import name 'load_export_options'`.

- [ ] **Step 3: Implement `load_export_options`**

In `scripts/train_for_run.py`, add after `_quant_fraction` (around line 47):

```python
DEFAULT_EXPORT_OPTIONS = {
    "ios": {"enabled": True, "precision": "fp16"},
    "android": {"enabled": True, "precision": "int8"},
}


def load_export_options(run_config: dict) -> dict:
    """Return {ios:{enabled,precision}, android:{enabled,precision}}.

    Falls back to DEFAULT_EXPORT_OPTIONS for legacy runs or malformed input.
    """
    raw = run_config.get("exportOptions") if isinstance(run_config, dict) else None
    if not isinstance(raw, dict):
        return {k: dict(v) for k, v in DEFAULT_EXPORT_OPTIONS.items()}
    result = {k: dict(v) for k, v in DEFAULT_EXPORT_OPTIONS.items()}
    for platform_key in ("ios", "android"):
        entry = raw.get(platform_key)
        if isinstance(entry, dict):
            if isinstance(entry.get("enabled"), bool):
                result[platform_key]["enabled"] = entry["enabled"]
            precision = entry.get("precision")
            if precision in {"int8", "fp16"}:
                result[platform_key]["precision"] = precision
    return result
```

Note: `run_config` here is the *run row's* config_yaml dict (i.e. `run_row.get("config_yaml")`), not the local training config built by `build_training_config`. We'll wire it at the call site in Task 4.

- [ ] **Step 4: Run tests and verify pass**

Run: `pytest tests/scripts/test_train_for_run_exports.py -v`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/train_for_run.py tests/scripts/test_train_for_run_exports.py
git commit -m "feat(trainer): add load_export_options with safe defaults"
```

---

## Task 3: Trainer — `log_step` structured logger

**Files:**
- Modify: `scripts/train_for_run.py`
- Modify: `tests/scripts/test_train_for_run_exports.py`

- [ ] **Step 1: Add failing test for log entry shape**

Append to `tests/scripts/test_train_for_run_exports.py`:

```python
from unittest.mock import MagicMock
from datetime import datetime
from train_for_run import build_structured_log_entry


def test_build_structured_log_entry_shape():
    entry = build_structured_log_entry(
        step=5, phase="export", status="ok", message="TFLite done"
    )
    assert entry["step"] == 5
    assert entry["phase"] == "export"
    assert entry["status"] == "ok"
    assert entry["message"] == "TFLite done"
    # ts must be ISO8601 UTC
    datetime.fromisoformat(entry["ts"].replace("Z", "+00:00"))


def test_build_structured_log_entry_step_none():
    entry = build_structured_log_entry(
        step=None, phase=None, status="info", message="free text"
    )
    assert entry["step"] is None
    assert entry["phase"] is None
```

- [ ] **Step 2: Verify failure**

Run: `pytest tests/scripts/test_train_for_run_exports.py -v`
Expected: FAIL on `build_structured_log_entry` import.

- [ ] **Step 3: Implement `build_structured_log_entry` and refactor `append_log`**

In `scripts/train_for_run.py`, add at module scope (near `quantization_metadata`):

```python
def build_structured_log_entry(
    *,
    step: int | None,
    phase: str | None,
    status: str,
    message: str,
) -> dict:
    return {
        "ts": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "step": step,
        "phase": phase,
        "status": status,
        "message": message,
    }
```

Then inside `main()`, replace the existing `append_log` definition (lines ~482-496) with:

```python
def append_log_entry(entry: dict | str) -> None:
    """Append one entry (structured dict or legacy string) to runs.config_yaml.logs."""
    try:
        rows = client._json("GET", f"/rest/v1/runs?id=eq.{args.run_id}&select=config_yaml", None)
        if not rows:
            return
        cfg = rows[0].get("config_yaml") or {}
        logs = list(cfg.get("logs") or [])
        logs.append(entry)
        cfg["logs"] = logs
        client._json("PATCH", f"/rest/v1/runs?id=eq.{args.run_id}", {"config_yaml": cfg})
    except Exception as exc:
        print(f"[logs] append_log_entry failed: {exc}", file=sys.stderr)

def log_step(step: int | None, phase: str | None, status: str, message: str) -> None:
    append_log_entry(build_structured_log_entry(step=step, phase=phase, status=status, message=message))

def append_log(line: str) -> None:  # kept for any legacy free-text call sites
    append_log_entry(build_structured_log_entry(step=None, phase=None, status="info", message=line))
```

- [ ] **Step 4: Run tests**

Run: `pytest tests/scripts/test_train_for_run_exports.py -v`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/train_for_run.py tests/scripts/test_train_for_run_exports.py
git commit -m "feat(trainer): structured log entries with step/phase/status"
```

---

## Task 4: Trainer — guarded exports, sub-phase logs, metadata sentinels

**Files:**
- Modify: `scripts/train_for_run.py`

- [ ] **Step 1: Wire `load_export_options` into `main`**

In `main()`, after `run_row = fetch_run(...)` and `config = build_training_config(...)` (around line 461), add:

```python
export_options = load_export_options(run_row.get("config_yaml") or {})
```

Defense-in-depth: reject if both disabled.

```python
if not export_options["ios"]["enabled"] and not export_options["android"]["enabled"]:
    print("Both iOS and Android exports disabled — refusing to run.", file=sys.stderr)
    return 2
```

- [ ] **Step 2: Replace per-epoch + start logs with structured calls**

Replace the existing `append_log(...)` calls at lines ~524, 529, 531 with the structured equivalents:

```python
# Inside on_fit_epoch_end, replace `append_log(" | ".join(bits))` with:
log_step(5, "training", "info", " | ".join(bits))

# Replace the two pre-training append_log calls:
log_step(5, "model-init", "ok", f"Training started on {gpu}, target epochs={total_epochs}")
if git_sha:
    log_step(5, "model-init", "info", f"Training script git={git_sha}")
```

Add a `dataset-ready` log just before `model = YOLO(config["model"])`:

```python
log_step(5, "dataset-ready", "ok",
         f"Dataset ready · data={config.get('data')} epochs={total_epochs}")
```

- [ ] **Step 3: Guard TFLite export with `export_options["android"]["enabled"]`**

Replace the TFLite block (lines ~551-565) with:

```python
tflite_path: Path | None = None
tflite_artifact = None
tflite_quantization: dict = {"precision": "skipped", "method": "none", "target": "tflite"}

if export_options["android"]["enabled"]:
    tflite_export_kwargs = export_kwargs("tflite", config)
    tflite_quantization = quantization_metadata("tflite", tflite_export_kwargs)
    log_step(5, "export", "started",
             f"TFLite INT8 export starting (fraction={tflite_export_kwargs.get('fraction')})")
    try:
        export_path = model.export(**tflite_export_kwargs)
        export_path = export_path[0] if isinstance(export_path, (list, tuple)) else export_path
        tflite_path = Path(export_path) if export_path else None
        if not tflite_path or not tflite_path.exists():
            raise FileNotFoundError("TFLite export returned no artifact")
        log_step(5, "export", "ok", f"TFLite export done · {tflite_path.name}")
    except Exception as exc:
        tflite_quantization = {"precision": "failed", "method": "none", "target": "tflite"}
        tflite_path = None
        log_step(5, "export", "error", f"TFLite export failed: {exc}")
else:
    log_step(5, "export", "info", "TFLite disabled · skipping")
```

- [ ] **Step 4: Guard CoreML export symmetrically**

Replace the CoreML block (lines ~567-583) with:

```python
coreml_path: Path | None = None
coreml_artifact = None
coreml_quantization: dict = {"precision": "skipped", "method": "none", "target": "coreml"}

if export_options["ios"]["enabled"]:
    coreml_export_kwargs = export_kwargs("coreml", config)
    coreml_quantization = quantization_metadata("coreml", coreml_export_kwargs)
    log_step(5, "export", "started",
             f"Core ML {coreml_quantization.get('precision', 'fp32').upper()} export starting")
    try:
        export_path = model.export(**coreml_export_kwargs)
        export_path = export_path[0] if isinstance(export_path, (list, tuple)) else export_path
        coreml_path = Path(export_path) if export_path else None
        if not coreml_path or not coreml_path.exists():
            raise FileNotFoundError("Core ML export returned no artifact")
        log_step(5, "export", "ok", f"Core ML export done · {coreml_path.name}")
    except Exception as exc:
        coreml_quantization = {"precision": "failed", "method": "none", "target": "coreml"}
        coreml_path = None
        log_step(5, "export", "error", f"Core ML export failed: {exc}")
else:
    log_step(5, "export", "info", "Core ML disabled · skipping")
```

- [ ] **Step 5: Guard uploads and version creation**

Replace the upload block (lines ~599-611) and `client.create_version` call (lines ~632-642) with:

```python
log_step(5, "upload", "started", "Uploading produced artifacts to R2")

if tflite_path is not None:
    tflite_artifact = client.upload_artifact(
        tflite_path, kind="tflite", run_id=args.run_id, semver=semver,
    )

if coreml_path is not None:
    coreml_artifact = client.upload_artifact(
        coreml_path, kind="coreml", run_id=args.run_id, semver=semver,
        content_type="application/zip" if coreml_path.is_dir() else None,
    )

log_step(5, "upload", "ok",
         f"Uploaded {sum(1 for a in [pytorch_artifact, tflite_artifact, coreml_artifact] if a)} artifacts")

# build_version_metadata must accept None artifacts — see Task 5.
metadata = build_version_metadata(
    run_row=run_row,
    config=config,
    results=results,
    pytorch_artifact=pytorch_artifact,
    tflite_artifact=tflite_artifact,
    coreml_artifact=coreml_artifact,
    tflite_quantization=tflite_quantization,
    coreml_quantization=coreml_quantization,
    host=platform.node() or "colab",
    git_sha=git_sha,
)
# ... existing validate_local_qa_artifact call ...

client.create_version(
    run_id=args.run_id,
    model_line_id=run_row["model_line_id"],
    semver=semver,
    metadata=metadata,
    tflite_r2_key=tflite_artifact.r2_key if tflite_artifact else None,
    mlmodel_r2_key=coreml_artifact.r2_key if coreml_artifact else None,
    pytorch_r2_key=pytorch_artifact.r2_key,
    size_bytes=(tflite_artifact.size_bytes if tflite_artifact
                else coreml_artifact.size_bytes if coreml_artifact
                else pytorch_artifact.size_bytes),
    content_hash=(tflite_artifact.content_hash if tflite_artifact
                  else coreml_artifact.content_hash if coreml_artifact
                  else pytorch_artifact.content_hash),
)

log_step(6, None, "ok",
         f"Version {semver} created · "
         f"tflite={tflite_quantization['precision']} coreml={coreml_quantization['precision']}")
finalize_run("succeeded")
```

- [ ] **Step 6: Run the existing trainer test suite + the new tests**

Run: `pytest tests/scripts/ -v`
Expected: PASS for all `test_train_for_run_exports` tests. Any pre-existing trainer tests should still pass (or be unaffected).

- [ ] **Step 7: Commit**

```bash
git add scripts/train_for_run.py
git commit -m "feat(trainer): guard exports by exportOptions, emit sub-phase logs"
```

---

## Task 5: Trainer — `build_version_metadata` handles None artifacts

**Files:**
- Modify: `scripts/train_for_run.py` (the `build_version_metadata` and `artifact_metadata` functions)

- [ ] **Step 1: Read the current `build_version_metadata` (around lines 172-219) and adapt**

Update `artifact_metadata` to accept an optional artifact:

```python
def artifact_metadata(*, kind: str, artifact, quantization: dict) -> dict:
    if artifact is None:
        return {
            "r2_key": None,
            "size_bytes": None,
            "content_hash": None,
            "quantization": quantization,
        }
    return {
        "r2_key": artifact.r2_key,
        "size_bytes": artifact.size_bytes,
        "content_hash": artifact.content_hash,
        "quantization": quantization,
    }
```

In `build_version_metadata`, where artifact precision strings are surfaced in the `artifacts` dict, ensure they reflect the actual quantization precision (which is now `"skipped"` or `"failed"` when applicable). No structural change is needed if it already calls `artifact_metadata(...)` — only that helper is updated.

- [ ] **Step 2: Add a unit test**

Append to `tests/scripts/test_train_for_run_exports.py`:

```python
from train_for_run import artifact_metadata


def test_artifact_metadata_handles_none_artifact():
    meta = artifact_metadata(
        kind="tflite",
        artifact=None,
        quantization={"precision": "skipped", "method": "none", "target": "tflite"},
    )
    assert meta["r2_key"] is None
    assert meta["size_bytes"] is None
    assert meta["content_hash"] is None
    assert meta["quantization"]["precision"] == "skipped"
```

- [ ] **Step 3: Run tests**

Run: `pytest tests/scripts/test_train_for_run_exports.py -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/train_for_run.py tests/scripts/test_train_for_run_exports.py
git commit -m "feat(trainer): artifact_metadata handles missing (skipped/failed) artifacts"
```

---

## Task 6: Web — Start Training form toggles

**Files:**
- Modify: `apps/web/src/App.tsx` (the Start Training form, near the hyperparameters block — search for `epochs` input).

- [ ] **Step 1: Locate the form state for hyperparameters**

In `apps/web/src/App.tsx`, find the state hook that holds the new-run form (search for `hyperParameters` and the form submit handler). Add a sibling state:

```typescript
const [exportOptions, setExportOptions] = useState<ExportOptions>({
  ios:     { enabled: true, precision: "fp16" },
  android: { enabled: true, precision: "int8" },
});
```

(Import `ExportOptions` from `./registry/types`.)

- [ ] **Step 2: Render the toggle UI under hyperparameters**

Add this JSX block immediately below the hyperparameters fieldset:

```tsx
<fieldset className="export-targets">
  <legend>Export targets</legend>
  <label>
    <input
      type="checkbox"
      checked={exportOptions.ios.enabled}
      onChange={(e) => setExportOptions(prev => ({
        ...prev, ios: { ...prev.ios, enabled: e.target.checked },
      }))}
    />
    iOS (Core ML, FP16)
  </label>
  <label>
    <input
      type="checkbox"
      checked={exportOptions.android.enabled}
      onChange={(e) => setExportOptions(prev => ({
        ...prev, android: { ...prev.android, enabled: e.target.checked },
      }))}
    />
    Android (TF Lite, INT8)
  </label>
  {!exportOptions.ios.enabled && !exportOptions.android.enabled && (
    <p className="error">At least one platform must be enabled.</p>
  )}
</fieldset>
```

Style with the existing form CSS conventions (look at how the hyperparameters fieldset is styled and match).

- [ ] **Step 3: Wire submit handler**

In the form's submit handler, where the run-create payload is assembled, add `exportOptions` to the `config_yaml` payload:

```typescript
const configPayload = {
  // ... existing fields (dataset, hyperparameters, classes, sourceWeights, etc.)
  exportOptions,
};
```

Disable the submit button if `!exportOptions.ios.enabled && !exportOptions.android.enabled`.

- [ ] **Step 4: Type-check + run web app**

Run: `cd apps/web && npx tsc --noEmit && npm run dev`
Expected: No type errors. Open the new-run page; verify both checkboxes render, toggling one off keeps submit enabled, toggling both off disables submit and shows the error.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): per-run iOS/Android export toggles on Start Training form"
```

---

## Task 7: Web — Training Config card surfaces export targets

**Files:**
- Modify: `apps/web/src/App.tsx` (the run-detail / Training Config card — search for where `hyperParameters` are rendered as a read-only card).

- [ ] **Step 1: Find the card**

Search `apps/web/src/App.tsx` for the JSX block that lists `epochs`, `imgsz`, `batch`, etc. as a read-only summary. That's the Training Config card.

- [ ] **Step 2: Add an "Export targets" line**

Add after the existing hyperparameter rows:

```tsx
<div className="config-row">
  <span className="label">Export targets</span>
  <span className="value">
    {formatExportTargets(run.config.exportOptions)}
  </span>
</div>
```

Add a helper above the component (or in a shared utils file):

```typescript
function formatExportTargets(opts?: ExportOptions): string {
  if (!opts) return "iOS Core ML FP16 · Android TF Lite INT8 (legacy default)";
  const ios = opts.ios.enabled ? `iOS Core ML ${opts.ios.precision.toUpperCase()}` : "iOS disabled";
  const android = opts.android.enabled ? `Android TF Lite ${opts.android.precision.toUpperCase()}` : "Android disabled";
  return `${ios} · ${android}`;
}
```

- [ ] **Step 3: Verify visually**

Run: `cd apps/web && npm run dev`
Expected: Open a run that has `exportOptions` and verify the line renders. Open a legacy run (no `exportOptions`) and verify the fallback string.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): show export targets in Training Config card"
```

---

## Task 8: Web — Model Detail handles `skipped`/`failed` artifacts

**Files:**
- Modify: `apps/web/src/App.tsx` (lines ~2188-2212 — the Model Detail artifacts panel).

- [ ] **Step 1: Read the existing artifact rows**

Locate the JSX that renders `"TF Lite · ${tflitePrecision.toUpperCase()}"` etc.

- [ ] **Step 2: Branch on sentinel precisions**

Replace each artifact row with:

```tsx
{(() => {
  const p = version.tflitePrecision;
  if (p === "skipped") {
    return <li className="artifact-row dimmed">TF Lite · disabled</li>;
  }
  if (p === "failed") {
    return <li className="artifact-row warn">TF Lite · failed</li>;
  }
  return (
    <li className="artifact-row">
      <span>TF Lite · {(p ?? "fp32").toUpperCase()}</span>
      <DownloadButton r2Key={version.tfliteR2Key!} />
    </li>
  );
})()}
```

Repeat for Core ML using `version.coremlPrecision` / `version.coremlR2Key`.

- [ ] **Step 3: Verify**

Run: `cd apps/web && npm run dev`
Expected: For a version with `tflitePrecision="skipped"`, the row shows "TF Lite · disabled" dimmed and no download button.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): render skipped/failed artifacts in Model Detail"
```

---

## Task 9: Web — Run Logs panel with structured rendering + 6-step stepper

**Files:**
- Modify: `apps/web/src/App.tsx` (lines ~2649-2655 — the Run logs section).
- Create: `apps/web/src/registry/__tests__/runLogStepper.test.tsx` (or wherever the existing test setup lives — check `apps/web/package.json` for the test runner; if Vitest isn't configured, skip this file and rely on manual verification).

- [ ] **Step 1: Add a `RunStepper` component**

Above the run-detail component in `App.tsx`, add:

```tsx
const STEP_LABELS = [
  "Open notebook",
  "Run all cells",
  "Authenticate",
  "Confirm dataset",
  "Train + export",
  "Review artifacts",
];

type StepState = "pending" | "running" | "ok" | "error";

function stepStatesFromLogs(logs: RunLogEntry[]): StepState[] {
  const states: StepState[] = Array(6).fill("pending");
  states[0] = "ok"; // step 1 = run created, always implicit
  for (const entry of logs) {
    if (typeof entry === "string") continue;
    if (!entry.step) continue;
    const idx = entry.step - 1;
    if (entry.status === "error") states[idx] = "error";
    else if (entry.status === "ok" && states[idx] !== "error") states[idx] = "ok";
    else if (states[idx] === "pending") states[idx] = "running";
  }
  return states;
}

function RunStepper({ logs }: { logs: RunLogEntry[] }) {
  const states = stepStatesFromLogs(logs);
  return (
    <ol className="run-stepper">
      {STEP_LABELS.map((label, i) => (
        <li key={i} className={`step step-${states[i]}`}>
          <span className="dot" />
          <span className="label">{label}</span>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 2: Add a log entry renderer**

```tsx
function renderLogEntry(entry: RunLogEntry, idx: number): JSX.Element {
  if (typeof entry === "string") {
    return <li key={idx} className="log-line legacy">{entry}</li>;
  }
  const prefix = entry.phase
    ? `[${entry.step}·${entry.phase}]`
    : entry.step
    ? `[${entry.step}]`
    : "";
  const cls = `log-line status-${entry.status}`;
  return (
    <li key={idx} className={cls}>
      <span className="prefix">{prefix}</span> {entry.message}
    </li>
  );
}
```

- [ ] **Step 3: Update the Run logs section to use both**

Replace the current `run.logs.map(...)` rendering with:

```tsx
<section className="run-logs">
  <RunStepper logs={run.logs} />
  <ul className="log-list">{run.logs.map(renderLogEntry)}</ul>
</section>
```

- [ ] **Step 4: Add stepper unit test (if vitest is configured)**

Check `apps/web/package.json` for a `test` script. If vitest is set up, create `apps/web/src/registry/__tests__/runLogStepper.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { stepStatesFromLogs } from "../../App"; // adjust if not exported — export it

describe("stepStatesFromLogs", () => {
  it("marks step 1 ok by default", () => {
    const s = stepStatesFromLogs([]);
    expect(s[0]).toBe("ok");
    expect(s[1]).toBe("pending");
  });
  it("promotes to running on info, ok on ok, error on error", () => {
    const logs = [
      { ts: "x", step: 2, phase: null, status: "started", message: "" },
      { ts: "x", step: 3, phase: null, status: "ok", message: "" },
      { ts: "x", step: 4, phase: null, status: "error", message: "" },
    ];
    const s = stepStatesFromLogs(logs as any);
    expect(s[1]).toBe("running");
    expect(s[2]).toBe("ok");
    expect(s[3]).toBe("error");
  });
});
```

If vitest is *not* configured, skip this file — manual verification in Step 5 is sufficient.

- [ ] **Step 5: Verify manually**

Run: `cd apps/web && npm run dev`. Open a run that has structured logs (you'll need to either wait for a real run or seed with a manual PATCH to `runs.config_yaml.logs`). Expected: stepper renders 6 dots; legacy string entries render unprefixed; structured entries show `[N·phase]` badges.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/registry/__tests__/
git commit -m "feat(web): structured run logs with 6-step progress stepper"
```

---

## Task 10: Notebook — remove env vars, add `log_step` helper, instrument cells

**Files:**
- Modify: `notebooks/train_run.ipynb`

- [ ] **Step 1: Inspect the notebook structure**

Run: `python -c "import json; nb=json.load(open('notebooks/train_run.ipynb')); print(len(nb['cells'])); [print(i, c['cell_type'], ''.join(c['source'])[:80].replace(chr(10),' | ')) for i,c in enumerate(nb['cells'])]"`
Expected: A list of cells. Identify which contain `ADVANCE_SEEDS_COREML_INT8`, `ADVANCE_SEEDS_QUANT_FRACTION`, the authentication prompt, the dataset resolution, and the `train_for_run.py` invocation.

- [ ] **Step 2: Remove env-var lines from the trainer-launch cell**

In the cell that calls `train_for_run.py`, delete the lines:

```python
os.environ["ADVANCE_SEEDS_COREML_INT8"] = "1"  # or any toggle line
os.environ["ADVANCE_SEEDS_QUANT_FRACTION"] = "1.0"
```

These are now replaced by `exportOptions` in the run config. (Leave any other env vars alone.)

- [ ] **Step 3: Add a `log_step` helper cell early in the notebook**

Insert a new code cell right after the imports cell (cell ~2 or 3) with:

```python
from datetime import datetime, timezone
import json as _json
import urllib.request as _ur

def log_step(step, phase, status, message):
    """Best-effort PATCH of runs.config_yaml.logs with a structured entry."""
    try:
        url = f"{SUPABASE_URL}/rest/v1/runs?id=eq.{RUN_ID}&select=config_yaml"
        req = _ur.Request(url, headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        })
        rows = _json.loads(_ur.urlopen(req).read())
        if not rows:
            return
        cfg = rows[0].get("config_yaml") or {}
        logs = list(cfg.get("logs") or [])
        logs.append({
            "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "step": step,
            "phase": phase,
            "status": status,
            "message": message,
        })
        cfg["logs"] = logs
        req2 = _ur.Request(
            f"{SUPABASE_URL}/rest/v1/runs?id=eq.{RUN_ID}",
            data=_json.dumps({"config_yaml": cfg}).encode(),
            method="PATCH",
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
        )
        _ur.urlopen(req2).read()
    except Exception as exc:
        print(f"[log_step] {exc}")
```

(Depends on `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RUN_ID` already being defined earlier — they are; check the auth cell.)

- [ ] **Step 4: Instrument cells 1, 7, 10**

- At the end of cell 1 (after `RUN_ID` is parsed from URL): `log_step(2, None, "started", f"Notebook execution started · RUN_ID={RUN_ID}")`
- After successful auth in cell 7: `log_step(3, None, "ok", "Authenticated as service_role")` (and wrap any failure path in a try/except that emits `log_step(3, None, "error", str(exc))`).
- After dataset YAML resolution in cell 10: `log_step(4, None, "ok", f"Dataset resolved · {n_images} images")` (where `n_images` is computed from the dataset stats; if not available, just `"Dataset YAML resolved"`).

- [ ] **Step 5: Validate notebook JSON**

Run: `python -c "import json; json.load(open('notebooks/train_run.ipynb')); print('ok')"`
Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
git add notebooks/train_run.ipynb
git commit -m "feat(notebook): structured step logs + remove env-var export toggles"
```

---

## Task 11: Edge function — `list-deployed-models` filters skipped/failed

**Files:**
- Modify: `supabase/functions/list-deployed-models/index.ts`

- [ ] **Step 1: Read the current handler**

Open the file and find where the version row's artifact fields are assembled into the response (search for `tflite_r2_key` or `coreml_r2_key`).

- [ ] **Step 2: Add a filter helper**

```typescript
function includeArtifact(r2Key: string | null, precision: string | null): boolean {
  if (!r2Key) return false;
  if (precision === "skipped" || precision === "failed") return false;
  return true;
}
```

- [ ] **Step 3: Guard each artifact in the response**

Wherever the response includes `tflite` and `coreml` artifact entries, wrap them:

```typescript
const artifacts = [];
if (includeArtifact(version.tflite_r2_key, version.tflite_precision)) {
  artifacts.push({ kind: "tflite", r2_key: version.tflite_r2_key, precision: version.tflite_precision });
}
if (includeArtifact(version.coreml_r2_key, version.coreml_precision)) {
  artifacts.push({ kind: "coreml", r2_key: version.coreml_r2_key, precision: version.coreml_precision });
}
// pytorch always included if present (Local QA)
if (version.pytorch_r2_key) {
  artifacts.push({ kind: "pytorch", r2_key: version.pytorch_r2_key, precision: version.pytorch_precision });
}
```

(Adapt to the actual response shape in the existing handler — keep field names consistent with what the mobile client already consumes.)

- [ ] **Step 4: Smoke-test locally**

Run: `cd supabase && npx supabase functions serve list-deployed-models` (or use the project's existing dev workflow).
Expected: Manually `curl` with a version-id that has `coreml_precision="skipped"`; verify the response omits the CoreML artifact.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/list-deployed-models/index.ts
git commit -m "feat(edge): list-deployed-models hides skipped/failed artifacts"
```

---

## Task 12: Edge function — reject runs with both platforms disabled

**Files:**
- Modify: `supabase/functions/<create-run-handler>/index.ts` (find the handler — search `supabase/functions/` for the one that inserts into `runs`).

- [ ] **Step 1: Locate the run-create handler**

Run: `grep -lR "insert" supabase/functions/ | xargs grep -l "runs"` to find which function inserts the run row.

- [ ] **Step 2: Add validation before insert**

```typescript
const exportOptions = body?.config_yaml?.exportOptions;
if (exportOptions
    && exportOptions.ios?.enabled === false
    && exportOptions.android?.enabled === false) {
  return new Response(
    JSON.stringify({ error: "At least one of iOS or Android exports must be enabled." }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );
}
```

- [ ] **Step 3: Smoke-test**

POST a payload with both disabled; expect 400. POST with one enabled; expect 200.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/<create-run-handler>/index.ts
git commit -m "feat(edge): reject runs that disable both export platforms"
```

---

## Task 13: End-to-end smoke test

- [ ] **Step 1: Run a real Colab training run**

In the web app, start a run with **Android disabled, iOS enabled**.

- [ ] **Step 2: Open the run detail page during training**

Expected:
- Stepper dots light up: 1=ok, 2=running→ok, 3=ok, 4=ok, 5=running, 6=pending.
- Logs panel shows `[2] Notebook execution started...`, `[3] Authenticated...`, `[4] Dataset resolved...`, `[5·dataset-ready]`, `[5·model-init]`, `[5·training] Epoch 1/N | ...`, eventually `[5·export] TFLite disabled · skipping`, `[5·export] Core ML FP16 export starting`, `[5·upload]`, `[6] Version 1.0.0-... created`.

- [ ] **Step 3: Verify the resulting version row**

Query: `select tflite_r2_key, tflite_precision, coreml_r2_key, coreml_precision from versions where run_id = '<run-id>';`
Expected: `tflite_r2_key = NULL, tflite_precision = 'skipped', coreml_r2_key = <key>, coreml_precision = 'fp16'`.

- [ ] **Step 4: Verify list-deployed-models response**

Hit the edge function for the model line. Expected: the version's artifact list contains only the CoreML entry (and pytorch).

- [ ] **Step 5: Verify Model Detail page**

Expected: "TF Lite · disabled" (dimmed, no download), "Core ML · FP16" (with download).

- [ ] **Step 6: Repeat with iOS disabled, Android enabled** — symmetric expectations.

- [ ] **Step 7: Commit (no code changes — but tag the milestone)**

```bash
git tag e2e-smoke-quantization-toggles
```

---

## Self-review notes

- **Spec coverage:** every section in the spec maps to at least one task — data model (Task 1), trainer (2/3/4/5), notebook (10), web (6/7/8/9), edge functions (11/12), tests (2/3/5/9), error handling (4, 12), E2E (13). ✓
- **No placeholders.** Code blocks contain real code; commands are runnable. The one fuzzy area is the exact create-run handler filename in Task 12 — the engineer is told to `grep` for it because the repo may have either `create-run` or an inline route in a shared function. That's deliberate, not a placeholder.
- **Type consistency:** `RunLogEntry` is a union (string | structured) — used consistently in types.ts (Task 1) and consumed in web (Task 9). `PlatformPrecision` enum includes `"skipped"` and `"failed"` and is set by the trainer (Tasks 4/5), filtered by the edge function (Task 11), and rendered by the web (Task 8). ✓

Plan complete and saved to `docs/superpowers/plans/2026-05-21-quantization-toggles-and-step-logs.md`.
