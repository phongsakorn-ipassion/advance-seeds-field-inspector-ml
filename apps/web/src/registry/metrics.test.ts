import { describe, it, expect } from "vitest";
import { deriveF1Series, f1FromPrecisionRecall } from "./metrics";
import type { MetricPoint } from "./types";

function point(key: MetricPoint["key"], epoch: number, value: number): MetricPoint {
  return { key, label: key, step: epoch, epoch, value, rawName: key };
}

describe("f1FromPrecisionRecall", () => {
  it("returns harmonic mean", () => {
    expect(f1FromPrecisionRecall(0.8, 0.6)).toBeCloseTo(0.6857142857, 6);
  });

  it("returns 0 when both are 0", () => {
    expect(f1FromPrecisionRecall(0, 0)).toBe(0);
  });

  it("returns null when either input is missing", () => {
    expect(f1FromPrecisionRecall(undefined, 0.5)).toBeNull();
    expect(f1FromPrecisionRecall(0.5, null)).toBeNull();
  });

  it("returns null on non-finite input", () => {
    expect(f1FromPrecisionRecall(Number.NaN, 0.5)).toBeNull();
    expect(f1FromPrecisionRecall(0.5, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("deriveF1Series", () => {
  it("emits an F1 point per epoch that has both precision and recall", () => {
    const history: MetricPoint[] = [
      point("precision", 1, 0.7),
      point("recall", 1, 0.5),
      point("precision", 2, 0.8),
      point("recall", 2, 0.7),
    ];
    const f1 = deriveF1Series(history);
    expect(f1).toHaveLength(2);
    expect(f1[0].epoch).toBe(1);
    expect(f1[0].value).toBeCloseTo(0.5833333333, 6);
    expect(f1[1].epoch).toBe(2);
  });

  it("skips epochs missing either precision or recall", () => {
    const history: MetricPoint[] = [
      point("precision", 1, 0.7),
      point("precision", 2, 0.8),
      point("recall", 2, 0.7),
    ];
    const f1 = deriveF1Series(history);
    expect(f1).toHaveLength(1);
    expect(f1[0].epoch).toBe(2);
  });

  it("returns 0 when precision and recall are both 0", () => {
    const history: MetricPoint[] = [
      point("precision", 1, 0),
      point("recall", 1, 0),
    ];
    const f1 = deriveF1Series(history);
    expect(f1).toHaveLength(1);
    expect(f1[0].value).toBe(0);
  });

  it("returns points sorted by epoch", () => {
    const history: MetricPoint[] = [
      point("precision", 3, 0.9),
      point("recall", 3, 0.85),
      point("precision", 1, 0.7),
      point("recall", 1, 0.6),
    ];
    const f1 = deriveF1Series(history);
    expect(f1.map((p) => p.epoch)).toEqual([1, 3]);
  });
});
