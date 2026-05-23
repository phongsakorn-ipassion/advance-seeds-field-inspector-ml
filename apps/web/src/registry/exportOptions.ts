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

type SanitizedTarget = ExportTarget & { nms: ExportNms };
type SanitizedOptions = { ios: SanitizedTarget; android: SanitizedTarget };

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

function sanitizeTarget(value: unknown): SanitizedTarget {
  if (!value || typeof value !== "object") {
    return { quantize: true, nms: DEFAULT_EXPORT_NMS };
  }
  const v = value as Record<string, unknown>;
  return {
    quantize: typeof v.quantize === "boolean" ? v.quantize : true,
    nms: sanitizeNms(v.nms),
  };
}

export function sanitizeExportOptions(value: unknown): SanitizedOptions {
  if (!value || typeof value !== "object") return DEFAULT_EXPORT_OPTIONS as SanitizedOptions;
  const v = value as Record<string, unknown>;
  return { ios: sanitizeTarget(v.ios), android: sanitizeTarget(v.android) };
}

export function isNmsAtDefault(target: ExportTarget): boolean {
  const nms = target.nms ?? DEFAULT_EXPORT_NMS;
  return nms.maxDet === DEFAULT_EXPORT_NMS.maxDet
    && nms.iouThreshold === DEFAULT_EXPORT_NMS.iouThreshold
    && nms.confThreshold === DEFAULT_EXPORT_NMS.confThreshold;
}
