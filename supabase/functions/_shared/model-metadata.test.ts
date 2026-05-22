import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { artifactDetailForPlatform } from "./model-metadata.ts";

Deno.test("artifactDetailForPlatform exposes quantization and precision", () => {
  const detail = artifactDetailForPlatform(
    {
      artifacts: {
        tflite: {
          r2_key: "runs/run-1/model.tflite",
          size_bytes: 123,
          content_hash: "sha256:abc",
          quantization: { precision: "fp32", method: "none", target: "tflite" },
        },
      },
    },
    "android",
    "runs/run-1/model.tflite",
    999,
    "fallback",
  );

  assertEquals(detail, {
    kind: "tflite",
    r2_key: "runs/run-1/model.tflite",
    precision: "fp32",
    quantized: false,
    quantization: { precision: "fp32", method: "none", target: "tflite" },
    size_bytes: 123,
    content_hash: "sha256:abc",
  });
});

Deno.test("artifactDetailForPlatform falls back to version columns", () => {
  const detail = artifactDetailForPlatform({}, "ios", "runs/run-1/model.mlpackage.zip", 456, "sha256:coreml");
  assertEquals(detail.kind, "coreml");
  assertEquals(detail.r2_key, "runs/run-1/model.mlpackage.zip");
  assertEquals(detail.size_bytes, 456);
  assertEquals(detail.content_hash, "sha256:coreml");
  assertEquals(detail.precision, null);
  assertEquals(detail.quantized, null);
});
