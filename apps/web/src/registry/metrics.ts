import type { MetricKey, MetricPoint, MetricSummary } from "./types";

const labels: Record<MetricKey, string> = {
  map50: "mAP50",
  map5095: "mAP50-95",
  precision: "Precision",
  recall: "Recall",
  maskMap50: "Mask mAP50",
  maskMap5095: "Mask mAP50-95",
  maskPrecision: "Mask precision",
  maskRecall: "Mask recall",
};

const aliases: Array<[MetricKey, string[]]> = [
  ["map50", ["map50", "box.map50", "bbox.map50", "metrics/map50(b)"]],
  ["map5095", ["map5095", "map50-95", "map50_95", "box.map50-95", "bbox.map50-95", "metrics/map50-95(b)"]],
  ["precision", ["precision", "box.precision", "bbox.precision", "metrics/precision(b)"]],
  ["recall", ["recall", "box.recall", "bbox.recall", "metrics/recall(b)"]],
  ["maskMap50", ["maskmap50", "mask_map50", "mask.map50", "seg.map50", "segment.map50", "metrics/map50(m)"]],
  ["maskMap5095", ["maskmap5095", "maskmap50-95", "mask_map50_95", "maskmap", "mask_map", "mask.map50-95", "seg.map50-95", "segment.map50-95", "metrics/map50-95(m)"]],
  ["maskPrecision", ["maskprecision", "mask_precision", "mask.precision", "seg.precision", "segment.precision", "metrics/precision(m)"]],
  ["maskRecall", ["maskrecall", "mask_recall", "mask.recall", "seg.recall", "segment.recall", "metrics/recall(m)"]],
];

export function normalizeMetricName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function metricKeyForName(name: string): MetricKey | null {
  const normalized = normalizeMetricName(name);
  for (const [key, names] of aliases) {
    if (names.some((alias) => normalizeMetricName(alias) === normalized)) return key;
  }
  return null;
}

export function metricLabel(key: MetricKey): string {
  return labels[key];
}

export function metricPointFromRow(row: {
  step: number;
  epoch: number | null;
  name: string;
  value: number;
  recorded_at?: string;
}): MetricPoint | null {
  const key = metricKeyForName(row.name);
  if (!key) return null;
  return {
    key,
    label: metricLabel(key),
    step: row.step,
    epoch: row.epoch,
    value: row.value,
    rawName: row.name,
    recordedAt: row.recorded_at,
  };
}

export function summarizeMetricPoints(points: MetricPoint[]): MetricSummary {
  const summary: MetricSummary = {};
  for (const point of [...points].sort(compareMetricPointRecency)) {
    if (summary[point.key] === undefined) summary[point.key] = point.value;
  }
  return summary;
}

export function metricSummaryFromMetadata(metrics: unknown): MetricSummary {
  if (!metrics || typeof metrics !== "object") return {};
  const source = flattenMetricObject(metrics as Record<string, unknown>);
  const summary: MetricSummary = {};
  for (const [name, value] of Object.entries(source)) {
    if (name === "raw" || typeof value !== "number" || !Number.isFinite(value)) continue;
    const key = metricKeyForName(name);
    if (key) summary[key] = value;
  }
  const raw = source.raw;
  if (raw && typeof raw === "object") {
    for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const key = metricKeyForName(name);
      if (key && summary[key] === undefined) summary[key] = value;
    }
  }
  return summary;
}

function flattenMetricObject(source: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const flattened: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "raw") {
      flattened.raw = value;
      continue;
    }
    const name = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(flattened, flattenMetricObject(value as Record<string, unknown>, name));
    } else {
      flattened[name] = value;
    }
  }
  return flattened;
}

export function compareMetricPointRecency(a: MetricPoint, b: MetricPoint): number {
  const recorded = Date.parse(b.recordedAt ?? "") - Date.parse(a.recordedAt ?? "");
  if (Number.isFinite(recorded) && recorded !== 0) return recorded;
  if (b.step !== a.step) return b.step - a.step;
  return (b.epoch ?? -1) - (a.epoch ?? -1);
}
