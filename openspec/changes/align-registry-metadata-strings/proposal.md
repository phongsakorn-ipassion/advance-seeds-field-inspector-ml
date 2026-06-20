## Why

The `training-callback` Edge Function writes version metadata with `output_kind: "segmentation-mask"` and `task: "segmentation"`, and omits `model_name` entirely. Both strings are **outside** the accepted vocabularies:

- The ML contract (`src/advance_seeds_ml/contracts.py`) accepts `task ∈ {instance-segmentation, detection}` and `output_kind ∈ {raw, nms, end2end_nms_free, segmentation}`.
- The mobile app's `validateModelMetadata` (`apps/mobile/lib/models/compatibility.ts` in the demo repo) requires `task === "instance-segmentation"` and `output_kind === "segmentation"`.

Today nothing breaks **only because** the app's `metadataFromDeployment` (`apps/mobile/lib/models/modelRegistry.ts`) silently overwrites `task`, `output_kind`, thresholds, and calibration sources with hardcoded values, discarding whatever the registry sent. This is fragile: any other consumer that trusts the wire values, or any future removal of that defensive overwrite, breaks immediately. It also means the registry is a third, divergent producer of the model contract (see the demo repo's `advance-seeds-brain` drift register, D1).

## What Changes

- `training-callback` SHALL emit registry/version metadata using the contract vocabulary: `output_kind: "segmentation"`, `task: "instance-segmentation"`, and an explicit `model_name` derived from the run's source weights (e.g. `yolo26n-seg`).
- The app's `metadataFromDeployment` SHALL stop overwriting `task`/`output_kind` and instead pass the (now-valid) wire values through `validateModelMetadata`, failing loudly if a deployment violates the contract. (Cross-repo: tracked as a follow-up PR in the demo repo; this change makes that safe.)

Non-goals:

- Do not change the export pipeline (`scripts/export_mobile_model_candidates.py`) — it already emits `segmentation` / `[1,300,38]` and is the source of truth this change aligns to.
- Do not change `compat_signature` *computation*; but see Impact for the migration consequence of its inputs changing.

## Capabilities

### Modified Capabilities

- `model-registry`: registry-written version metadata MUST use the contract-aligned `task`/`output_kind` vocabulary and include `model_name`.

## Impact

- `supabase/functions/training-callback/index.ts` (+ `callback.ts`, `_shared/model-metadata.ts`) — metadata field values.
- **`compat_signature` migration risk (must read):** the server-computed `compat_signature` is derived from `class_names + input_size + output_kind + task`. Changing `output_kind`/`task` strings changes the signature for any newly registered version, so existing installed clients will see `resolve-channel → rebuild_required` against new deployments until they rebuild. Coordinate a deliberate cutover (or a one-time signature backfill) — do not ship silently.
- Demo repo `apps/mobile/lib/models/modelRegistry.ts` — remove the silent overwrite (separate, coordinated PR).
- No training, dataset, or web-dashboard logic changes.
