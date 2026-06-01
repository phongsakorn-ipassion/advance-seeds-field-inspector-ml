import { describe, it, expect } from "vitest";
import {
  STALE_RUN_THRESHOLD_MS,
  runLastActivityAt,
  isRunStalled,
  isDeletableRunStatus,
  displayRunStatus,
} from "./runStatus";
import type { RegistryRun, RunLogEntry, RunStatus } from "./types";

const T0 = "2026-06-01 12:00:00"; // startedAt format (space-separated)
const T0_MS = Date.parse("2026-06-01T12:00:00");

function run(overrides: Partial<RegistryRun> = {}): RegistryRun {
  return {
    id: "run-1",
    name: "Test run",
    status: "running",
    modelLine: "banana",
    dataset: "configs/dataset.yaml",
    hardware: "T4",
    startedAt: T0,
    finishedAt: null,
    progress: 50,
    map50: 0.5,
    maskMap: 0.4,
    metricsSummary: {},
    metricsHistory: [],
    config: {} as RegistryRun["config"],
    colabNotebook: "",
    logs: [],
    ...overrides,
  };
}

function structuredLog(ts: string, message = "msg"): RunLogEntry {
  return { ts, step: 5, phase: "training", status: "info", message };
}

describe("runLastActivityAt", () => {
  it("uses the newest structured log ts", () => {
    const r = run({
      logs: [
        structuredLog("2026-06-01T12:10:00Z"),
        structuredLog("2026-06-01T12:30:00Z"),
        structuredLog("2026-06-01T12:20:00Z"),
      ],
    });
    expect(runLastActivityAt(r)).toBe(Date.parse("2026-06-01T12:30:00Z"));
  });

  it("falls back to startedAt when logs are legacy strings", () => {
    const r = run({ logs: ["plain string log", "another"] as RunLogEntry[] });
    expect(runLastActivityAt(r)).toBe(T0_MS);
  });

  it("falls back to startedAt when there are no logs", () => {
    expect(runLastActivityAt(run({ logs: [] }))).toBe(T0_MS);
  });
});

describe("isRunStalled", () => {
  const fresh = run({ logs: [structuredLog("2026-06-01T12:00:00Z")] });

  it("is false for non-running statuses even when old", () => {
    const old = run({
      status: "succeeded" as RunStatus,
      logs: [structuredLog("2026-06-01T12:00:00Z")],
    });
    const wayLater = Date.parse("2026-06-01T20:00:00Z");
    expect(isRunStalled(old, wayLater)).toBe(false);
  });

  it("is false just under the 1h threshold", () => {
    const now = Date.parse("2026-06-01T12:00:00Z") + STALE_RUN_THRESHOLD_MS - 1;
    expect(isRunStalled(fresh, now)).toBe(false);
  });

  it("is true just over the 1h threshold", () => {
    const now = Date.parse("2026-06-01T12:00:00Z") + STALE_RUN_THRESHOLD_MS + 1;
    expect(isRunStalled(fresh, now)).toBe(true);
  });
});

describe("isDeletableRunStatus", () => {
  it("is true for waiting and stalled, false otherwise", () => {
    expect(isDeletableRunStatus("waiting")).toBe(true);
    expect(isDeletableRunStatus("stalled")).toBe(true);
    expect(isDeletableRunStatus("running")).toBe(false);
    expect(isDeletableRunStatus("succeeded")).toBe(false);
    expect(isDeletableRunStatus("queued")).toBe(false);
  });
});

describe("displayRunStatus", () => {
  const now = Date.parse("2026-06-01T15:00:00Z"); // 3h after T0

  it("returns waiting for a running run with no progress or metrics", () => {
    const r = run({ progress: 0, map50: null, maskMap: null, logs: [] });
    expect(displayRunStatus(r, now)).toBe("waiting");
  });

  it("returns stalled for a running run with metrics but stale logs", () => {
    const r = run({ logs: [structuredLog("2026-06-01T12:05:00Z")] });
    expect(displayRunStatus(r, now)).toBe("stalled");
  });

  it("returns running for a fresh running run", () => {
    const freshNow = Date.parse("2026-06-01T12:10:00Z");
    const r = run({ logs: [structuredLog("2026-06-01T12:05:00Z")] });
    expect(displayRunStatus(r, freshNow)).toBe("running");
  });

  it("passes terminal statuses through unchanged", () => {
    expect(displayRunStatus(run({ status: "succeeded" }), now)).toBe("succeeded");
    expect(displayRunStatus(run({ status: "failed" }), now)).toBe("failed");
  });
});
