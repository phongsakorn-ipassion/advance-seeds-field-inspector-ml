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
});
