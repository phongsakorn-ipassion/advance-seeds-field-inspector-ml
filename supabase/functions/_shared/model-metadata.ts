export type Platform = "android" | "ios";

type ArtifactKind = "tflite" | "coreml";

type ArtifactDetail = {
  kind: ArtifactKind;
  r2_key: string | null;
  precision: string | null;
  quantized: boolean | null;
  quantization: Record<string, unknown> | null;
  size_bytes: number | null;
  content_hash: string | null;
};

export function artifactDetailForPlatform(
  metadata: unknown,
  platform: Platform,
  r2Key: string | null | undefined,
  fallbackSizeBytes: number | null | undefined,
  fallbackContentHash: string | null | undefined,
): ArtifactDetail {
  const kind = platform === "ios" ? "coreml" : "tflite";
  const artifact = artifactMetadata(metadata, kind);
  const quantization = recordOrNull(artifact?.quantization);
  const precision = stringOrNull(quantization?.precision);
  return {
    kind,
    r2_key: r2Key ?? stringOrNull(artifact?.r2_key),
    precision,
    quantized: precision ? !["fp32", "failed", "none"].includes(precision.toLowerCase()) : null,
    quantization,
    size_bytes: numberOrNull(artifact?.size_bytes) ?? fallbackSizeBytes ?? null,
    content_hash: stringOrNull(artifact?.content_hash) ?? fallbackContentHash ?? null,
  };
}

function artifactMetadata(metadata: unknown, kind: ArtifactKind): Record<string, unknown> | null {
  const md = recordOrNull(metadata);
  const artifacts = recordOrNull(md?.artifacts);
  return recordOrNull(artifacts?.[kind]);
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
