# Delete button for timed-out (stalled) running runs

**Date:** 2026-06-01
**Status:** Approved — implementing
**Area:** `apps/web` — Train pipeline → Live tracking

## Problem

A training run is launched via a manual Colab hand-off. When that Colab
session dies mid-training (disconnect, GPU timeout, browser closed), nothing
updates the registry row, so the run stays `status: "running"` forever. These
"zombie" rows accumulate in Live tracking with no way to clean them up — the
existing per-row delete button only appears for `"waiting"` runs (rows that
never started reporting).

## Goal

Surface the existing delete affordance on a `running` row once it has gone
**stale** — no log activity for more than 1 hour — so operators can remove
timed-out sessions. Reuse the existing delete button, confirm modal, and
`store.deleteRun()` path.

## Non-goals (YAGNI)

- No backend/DB status change. We do **not** auto-mark the run `failed`/
  `cancelled`; we only enable deletion.
- No auto-delete of stale runs.
- No user-configurable threshold — 1 hour is a named constant.
- No changes to the Recent-runs list behavior.

## Design

### New module: `src/registry/runStatus.ts`

Extract the existing inline `displayRunStatus`/`DisplayStatus` from `App.tsx`
into a focused, unit-testable module and extend it:

- `STALE_RUN_THRESHOLD_MS = 60 * 60 * 1000` — the 1-hour timeout.
- `runLastActivityAt(run): number` — the newest structured-log `ts` (epoch ms).
  Falls back to `startedAt` when logs are legacy strings / empty. Returns the
  best available "last activity" timestamp; `NaN`-safe.
- `isRunStalled(run, now): boolean` — `run.status === "running"` AND
  `now - runLastActivityAt(run) > STALE_RUN_THRESHOLD_MS`.
- `DisplayStatus` gains `"stalled"`.
- `displayRunStatus(run, now = Date.now()): DisplayStatus` with precedence:
  1. `waiting` — running, `progress === 0`, no `map50`/`maskMap` yet (unchanged).
  2. `stalled` — running, not waiting, and `isRunStalled(run, now)`.
  3. otherwise the raw `run.status`.

  A *waiting* run that sits idle stays `"waiting"` (already deletable);
  staleness only promotes a genuinely-`running` row (metrics flowed, then
  stopped) to `"stalled"`. This matches "Running with timeout session."

  `now` defaults to `Date.now()` so existing callers
  (`deriveActivityNotifications`, Recent list) keep working unchanged.

### Re-evaluation over time: `useNow` hook

Staleness depends on wall-clock, and a stalled run emits no realtime updates,
so render-on-data-change never reveals it. Add a small `useNow(60_000)` hook
(`setInterval` returning a ticking timestamp; cleared on unmount) used by the
Live tracking view. Rows re-evaluate to `"stalled"` about once a minute.

### `App.tsx` wiring

- `RunRow`:
  - `showDelete = (status === "waiting" || status === "stalled") && Boolean(onDelete)`.
  - Add a `"stalled"` status-dot + status-pill.
  - Per-status delete `aria-label`/`title` ("Delete timed-out run …").
- Live tab:
  - Thread `now` (from `useNow`) into `RunList → RunRow` so `displayRunStatus`
    sees current time.
  - The delete-confirm `Modal` picks **adaptive copy** from
    `displayRunStatus(pendingDelete, now)`:
    - `waiting` → current text ("Training has not started yet, so no metrics
      will be lost.").
    - `stalled` → warns that the run timed out and partial metrics/logs plus
      the run row will be permanently deleted.
  - Existing `confirmDelete()` / `store.deleteRun()` unchanged.

### Styling

Add `.status-dot.stalled` and `.status-pill.stalled` in a warning/amber tone,
consistent with existing `danger`/`muted` chips, in `styles.css`.

## Testing

New `src/registry/runStatus.test.ts` (vitest, matching `metrics.test.ts`):

- `runLastActivityAt`: newest structured `ts` wins; string-only logs fall back
  to `startedAt`; empty logs fall back to `startedAt`.
- `isRunStalled`: false for non-`running` statuses; false just under 1h; true
  just over 1h; boundary at exactly 1h.
- `displayRunStatus`: precedence — `waiting` beats `stalled`; a running run with
  metrics and stale logs → `stalled`; fresh running → `running`; terminal
  statuses pass through.

No backend/store changes → no Python/contract test updates.

## Files touched

- `apps/web/src/registry/runStatus.ts` (new)
- `apps/web/src/registry/runStatus.test.ts` (new)
- `apps/web/src/App.tsx` (import helpers, `useNow`, RunRow gating + pill, modal copy)
- `apps/web/src/styles.css` (stalled pill/dot)
