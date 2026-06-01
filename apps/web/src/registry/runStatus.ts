import type { RegistryRun, StructuredRunLogEntry } from "./types";

// A run whose Colab session dies stays status="running" forever. We treat such
// a run as "stalled" once it has gone this long without any log activity.
export const STALE_RUN_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

// Display-only status that promotes a stuck "running" run into a clearer state
// for the status pill: "waiting" (row inserted, trainer not reporting yet) or
// "stalled" (was reporting, then went silent past the timeout).
export type DisplayStatus =
  | "queued"
  | "waiting"
  | "running"
  | "stalled"
  | "succeeded"
  | "failed"
  | "cancelled";

// Registry timestamps are space-separated (e.g. "2026-06-01 12:00:00").
export function parseRegistryTimestamp(value: string): number {
  return Date.parse(value.replace(" ", "T"));
}

// Best-available "last activity" timestamp (epoch ms): the newest structured
// log entry's ts, falling back to startedAt for legacy string logs / no logs.
export function runLastActivityAt(run: RegistryRun): number {
  const logTimes = run.logs
    .filter((entry): entry is StructuredRunLogEntry => typeof entry !== "string")
    .map((entry) => Date.parse(entry.ts))
    .filter((ts) => !Number.isNaN(ts));
  return logTimes.length > 0 ? Math.max(...logTimes) : parseRegistryTimestamp(run.startedAt);
}

export function isRunStalled(run: RegistryRun, now: number): boolean {
  if (run.status !== "running") return false;
  const lastActivity = runLastActivityAt(run);
  if (Number.isNaN(lastActivity)) return false;
  return now - lastActivity > STALE_RUN_THRESHOLD_MS;
}

// A stuck run the operator may delete from Live tracking: it never started
// ("waiting") or its session timed out mid-run ("stalled").
export function isDeletableRunStatus(status: DisplayStatus): boolean {
  return status === "waiting" || status === "stalled";
}

export function displayRunStatus(run: RegistryRun, now: number = Date.now()): DisplayStatus {
  if (run.status === "running" && run.progress === 0 && run.map50 === null && run.maskMap === null) {
    return "waiting";
  }
  if (isRunStalled(run, now)) {
    return "stalled";
  }
  return run.status;
}
