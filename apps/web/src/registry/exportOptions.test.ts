import { describe, expect, it } from "vitest";
import { DEFAULT_EXPORT_NMS, sanitizeExportOptions } from "./exportOptions";

describe("sanitizeExportOptions", () => {
  it("returns defaults when input is undefined", () => {
    expect(sanitizeExportOptions(undefined)).toEqual({
      ios: { quantize: true, nms: DEFAULT_EXPORT_NMS },
      android: { quantize: true, nms: DEFAULT_EXPORT_NMS },
    });
  });

  it("preserves quantize and clamps out-of-range NMS values", () => {
    const result = sanitizeExportOptions({
      ios: { quantize: false, nms: { maxDet: 9999, iouThreshold: 2, confThreshold: -1 } },
      android: { quantize: true, nms: { maxDet: 0, iouThreshold: 0.5, confThreshold: 0.5 } },
    });
    expect(result.ios.quantize).toBe(false);
    expect(result.ios.nms).toEqual({ maxDet: 300, iouThreshold: 1, confThreshold: 0 });
    expect(result.android.nms).toEqual({ maxDet: 1, iouThreshold: 0.5, confThreshold: 0.5 });
  });

  it("rounds maxDet to nearest integer", () => {
    const result = sanitizeExportOptions({
      ios: { quantize: true, nms: { maxDet: 150.7, iouThreshold: 0.5, confThreshold: 0.5 } },
      android: { quantize: true },
    });
    expect(result.ios.nms.maxDet).toBe(151);
  });
});
