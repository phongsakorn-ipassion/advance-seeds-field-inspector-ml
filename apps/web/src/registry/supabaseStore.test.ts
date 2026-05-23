import { describe, expect, it } from "vitest";
import { exportOptionsFrom } from "./supabaseStore";

describe("exportOptionsFrom", () => {
  it("reads recorded quantization choices", () => {
    expect(exportOptionsFrom({
      ios: { quantize: false },
      android: { quantize: false },
    })).toEqual({
      ios: { quantize: false },
      android: { quantize: false },
    });
  });

  it("keeps platform defaults when only one platform is recorded", () => {
    expect(exportOptionsFrom({ ios: { quantize: false } })).toEqual({
      ios: { quantize: false },
      android: { quantize: true },
    });
  });

  it("returns undefined for legacy runs without recorded choices", () => {
    expect(exportOptionsFrom(undefined)).toBeUndefined();
    expect(exportOptionsFrom({})).toBeUndefined();
    expect(exportOptionsFrom("bad")).toBeUndefined();
  });

  it("reads version metadata export_options records", () => {
    const metadata = {
      export_options: {
        ios: { quantize: false },
        android: { quantize: false },
      },
    };

    expect(exportOptionsFrom(metadata.export_options)).toEqual({
      ios: { quantize: false },
      android: { quantize: false },
    });
  });

  it("preserves nms block on round trip", () => {
    const input = {
      ios: { quantize: false, nms: { maxDet: 150, iouThreshold: 0.6, confThreshold: 0.3 } },
      android: { quantize: true },
    };
    const out = exportOptionsFrom(input);
    expect(out?.ios.quantize).toBe(false);
    expect(out?.ios.nms).toEqual({ maxDet: 150, iouThreshold: 0.6, confThreshold: 0.3 });
    expect(out?.android.nms).toBeUndefined();
  });
});
