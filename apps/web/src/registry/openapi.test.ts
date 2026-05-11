import { describe, it, expect } from "vitest";
import { buildOpenApiSpec } from "./openapi";
import type { RegistryDeployment, RegistryVersion } from "./types";

function makeVersion(overrides: Partial<RegistryVersion> = {}): RegistryVersion {
  return {
    id: "version-test-1",
    semver: "1.2.3",
    runId: "run-1",
    state: "staging",
    sourceWeights: "yolo26n-seg.pt",
    dataset: "configs/test.yaml",
    classes: ["a", "b"],
    hyperParameters: { epochs: 10, imgsz: 640, batch: "auto", patience: 5, lr0: 0.001 },
    map50: 0.8,
    maskMap: 0.7,
    metricsSummary: {},
    sizeMb: 10,
    contentHash: "sha256:abc",
    tfliteR2Key: "tflite.key",
    tflitePrecision: "int8",
    coremlR2Key: null,
    coremlSizeMb: null,
    coremlContentHash: null,
    coremlPrecision: null,
    pytorchR2Key: "pt.key",
    pytorchSizeMb: 40,
    pytorchContentHash: "sha256:def",
    pytorchPrecision: "fp32",
    compatSignature: "compat-sig-xyz",
    createdAt: "2026-05-11 12:00",
    ...overrides,
  };
}

function deployment(channel: "staging" | "production"): RegistryDeployment {
  return { id: `dep-${channel}`, channel, versionId: "version-test-1", isDefault: true, deployedAt: "2026-05-11" };
}

describe("buildOpenApiSpec", () => {
  it("uses the provided server URL", () => {
    const spec = buildOpenApiSpec(makeVersion(), [deployment("staging")], {
      serverUrl: "https://example.com/functions/v1",
      modelLineSlug: "seeds-poc",
    }) as any;
    expect(spec.servers[0].url).toBe("https://example.com/functions/v1");
  });

  it("declares paths only for artifact kinds that exist on the version", () => {
    const spec = buildOpenApiSpec(makeVersion(), [deployment("staging")], {
      serverUrl: "x",
      modelLineSlug: "y",
    }) as any;
    const kindParam = spec.paths["/model-artifact/{kind}"].get.parameters.find((p: any) => p.name === "kind");
    expect(kindParam.schema.enum).toEqual(["tflite", "pytorch"]);
  });

  it("omits the artifact path when no exports exist on the version", () => {
    const version = makeVersion({ tfliteR2Key: "", pytorchR2Key: null, coremlR2Key: null });
    const spec = buildOpenApiSpec(version, [deployment("staging")], { serverUrl: "x", modelLineSlug: "y" }) as any;
    expect(spec.paths["/model-artifact/{kind}"]).toBeUndefined();
  });

  it("pre-fills version id and compat signature on resolve-channel parameters", () => {
    const spec = buildOpenApiSpec(makeVersion(), [deployment("production")], {
      serverUrl: "x",
      modelLineSlug: "seeds-poc",
    }) as any;
    const params = spec.paths["/resolve-channel"].get.parameters;
    const versionParam = params.find((p: any) => p.name === "current_version");
    const compatParam = params.find((p: any) => p.name === "current_compat");
    expect(versionParam.schema.default).toBe("version-test-1");
    expect(compatParam.schema.default).toBe("compat-sig-xyz");
  });

  it("uses both deployed channels in the channel enum when both are present", () => {
    const spec = buildOpenApiSpec(makeVersion(), [deployment("staging"), deployment("production")], {
      serverUrl: "x",
      modelLineSlug: "y",
    }) as any;
    const channelParam = spec.paths["/list-deployed-models"].get.parameters.find((p: any) => p.name === "channel");
    expect(new Set(channelParam.schema.enum)).toEqual(new Set(["staging", "production"]));
  });

  it("falls back to both channels when no deployments exist", () => {
    const spec = buildOpenApiSpec(makeVersion(), [], { serverUrl: "x", modelLineSlug: "y" }) as any;
    const channelParam = spec.paths["/list-deployed-models"].get.parameters.find((p: any) => p.name === "channel");
    expect(new Set(channelParam.schema.enum)).toEqual(new Set(["staging", "production"]));
  });

  it("declares apikey and bearer security schemes globally", () => {
    const spec = buildOpenApiSpec(makeVersion(), [deployment("staging")], { serverUrl: "x", modelLineSlug: "y" }) as any;
    expect(spec.components.securitySchemes.apikey.name).toBe("apikey");
    expect(spec.components.securitySchemes.bearer.scheme).toBe("bearer");
    expect(spec.security).toEqual([{ apikey: [], bearer: [] }]);
  });
});
