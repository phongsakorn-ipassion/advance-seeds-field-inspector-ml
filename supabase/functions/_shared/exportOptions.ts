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
