import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateExportOptions } from "./exportOptions.ts";

Deno.test("validateExportOptions(undefined) returns ok with defaults", () => {
  const result = validateExportOptions(undefined);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value, { ios: { quantize: true }, android: { quantize: true } });
  }
});

Deno.test("validateExportOptions(null) returns ok with defaults", () => {
  const result = validateExportOptions(null);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value, { ios: { quantize: true }, android: { quantize: true } });
  }
});

Deno.test("validateExportOptions passes through valid nms block", () => {
  const result = validateExportOptions({
    ios: { quantize: true, nms: { maxDet: 200, iouThreshold: 0.5, confThreshold: 0.3 } },
    android: { quantize: true },
  });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value.ios.nms, { maxDet: 200, iouThreshold: 0.5, confThreshold: 0.3 });
    assertEquals(result.value.android.nms, undefined);
  }
});

Deno.test("validateExportOptions rejects maxDet=0", () => {
  const result = validateExportOptions({
    ios: { quantize: true, nms: { maxDet: 0, iouThreshold: 0.5, confThreshold: 0.3 } },
  });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors[0].field, "exportOptions.ios.nms.maxDet");
  }
});

Deno.test("validateExportOptions rejects maxDet=999", () => {
  const result = validateExportOptions({
    ios: { quantize: true, nms: { maxDet: 999, iouThreshold: 0.5, confThreshold: 0.3 } },
  });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors[0].field, "exportOptions.ios.nms.maxDet");
  }
});

Deno.test("validateExportOptions rejects maxDet=1.5 (non-integer)", () => {
  const result = validateExportOptions({
    ios: { quantize: true, nms: { maxDet: 1.5, iouThreshold: 0.5, confThreshold: 0.3 } },
  });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors[0].field, "exportOptions.ios.nms.maxDet");
  }
});

Deno.test("validateExportOptions rejects maxDet='x' (string)", () => {
  const result = validateExportOptions({
    ios: { quantize: true, nms: { maxDet: "x", iouThreshold: 0.5, confThreshold: 0.3 } },
  });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors[0].field, "exportOptions.ios.nms.maxDet");
  }
});

Deno.test("validateExportOptions rejects iouThreshold=2", () => {
  const result = validateExportOptions({
    ios: { quantize: true, nms: { maxDet: 100, iouThreshold: 2, confThreshold: 0.3 } },
  });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors[0].field, "exportOptions.ios.nms.iouThreshold");
  }
});

Deno.test("validateExportOptions rejects iouThreshold=-0.1", () => {
  const result = validateExportOptions({
    ios: { quantize: true, nms: { maxDet: 100, iouThreshold: -0.1, confThreshold: 0.3 } },
  });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors[0].field, "exportOptions.ios.nms.iouThreshold");
  }
});

Deno.test("validateExportOptions rejects iouThreshold='x' (string)", () => {
  const result = validateExportOptions({
    ios: { quantize: true, nms: { maxDet: 100, iouThreshold: "x", confThreshold: 0.3 } },
  });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors[0].field, "exportOptions.ios.nms.iouThreshold");
  }
});

Deno.test("validateExportOptions rejects non-object input", () => {
  const result = validateExportOptions("not-an-object");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.errors[0].field, "exportOptions");
  }
});
