---
project: shared
type: contract
status: active
tags: [contract, registry, compat, mobile]
created: 2026-06-22
updated: 2026-06-22
sources: [supabase/migrations/20260502000003_versions.sql#L2-L20, supabase/functions/_shared/compat.ts#L8-L23, supabase/functions/resolve-channel/index.ts]
canonical: true
---

# compat_signature (canonical)

> [!info] Canonical home — source of truth for the model-compatibility signature.
> Other pages link here; they don't restate the formula.

## The contract

`compat_signature = SHA256(canonical_JSON({class_names, input_size, output_kind, task}))`.

Computed in **two places that MUST agree byte-for-byte**:
- **Postgres trigger** on `versions` insert/update — `compute_compat_signature()`
  (`supabase/migrations/20260502000003_versions.sql:2`). Server source of truth.
- **Client JS** — `supabase/functions/_shared/compat.ts:8` (used by `resolve-channel`).

## Why it exists

It encodes the parts of the model contract that require a **native app rebuild** if
they change (class list, input size, output kind, task). The mobile client stores its
`current_compat`; `resolve-channel` compares it to the deployed version's signature:
- match → `update` (download new weights) or `noop`
- mismatch → **`rebuild_required`** (the Swift/Kotlin layer must be rebuilt, not just
  the weights swapped). See `supabase/functions/resolve-channel/index.ts`.

## Invariants & footguns

> [!warning] The canonical JSON is whitespace- and key-order-sensitive. Postgres
> `to_jsonb(array)::text` emits `["a", "b"]` (space after comma); the JS side must
> produce the identical string or every client sees a false `rebuild_required`.
> Key order is fixed: `class_names, input_size, output_kind, task`.

> [!warning] **Adding a class changes the signature** → all installed clients get
> `rebuild_required` until they rebuild (or you backfill old signatures). This is the
> real cost of the v8 multi-class rollout — coordinate a deliberate cutover, not a
> silent deploy. See [[drift-register]] (D-V8-CLASSES) and the in-flight OpenSpec
> change `align-registry-metadata-strings`.

> [!warning] If `class_names/input_size/output_kind/task` are missing from metadata,
> the trigger can produce a null/garbage signature. The registry must populate them.

## Producers and consumers
- **Producer:** the `versions` row's `metadata` (written by [[edge-functions]]
  `training-callback`) → trigger computes the signature.
- **Consumers:** [[edge-functions]] `resolve-channel` (mobile update check); the app's
  stored `current_compat`.

## Related
- [[model-export-contract]] — where output_kind/task/class_names originate
- [[model-registry-db]] · [[edge-functions]] · [[drift-register]]
