import type { RegistryDeployment, RegistryVersion } from "./types";

export type OpenApiDoc = Record<string, unknown>;

export function buildOpenApiSpec(
  version: RegistryVersion,
  deployments: RegistryDeployment[],
  options: { serverUrl: string; modelLineSlug: string },
): OpenApiDoc {
  const { serverUrl, modelLineSlug } = options;
  const deployedChannels = Array.from(new Set(deployments.map((d) => d.channel)));
  const channelsForPicker = deployedChannels.length > 0 ? deployedChannels : ["staging", "production"];

  const artifactKinds: Array<"tflite" | "coreml" | "pytorch"> = [];
  if (version.tfliteR2Key) artifactKinds.push("tflite");
  if (version.coremlR2Key) artifactKinds.push("coreml");
  if (version.pytorchR2Key) artifactKinds.push("pytorch");

  const paths: Record<string, unknown> = {
    "/list-deployed-models": {
      get: {
        tags: ["Mobile picker"],
        summary: "List deployable models for a channel + platform",
        parameters: [
          enumParam("model_line", "query", "Model line slug", [modelLineSlug], modelLineSlug),
          enumParam("channel", "query", "Deployment channel", channelsForPicker, channelsForPicker[0]),
          enumParam("platform", "query", "Consumer platform", ["android", "ios"], "android"),
        ],
        responses: okResponse("Array of selectable models", responseExample(version, "list")),
      },
    },
    "/resolve-channel": {
      get: {
        tags: ["Mobile resolve"],
        summary: "Resolve the channel default and check compatibility",
        parameters: [
          enumParam("model_line", "query", "Model line slug", [modelLineSlug], modelLineSlug),
          enumParam("channel", "query", "Deployment channel", channelsForPicker, channelsForPicker[0]),
          enumParam("platform", "query", "Consumer platform", ["android", "ios"], "android"),
          stringParam("current_version", "query", "Currently installed version id on the client", version.id),
          stringParam("current_compat", "query", "Currently installed compat signature on the client", version.compatSignature),
        ],
        responses: okResponse("Resolved model with artifact URLs or up_to_date status", responseExample(version, "resolve")),
      },
    },
  };

  if (artifactKinds.length > 0) {
    paths["/model-artifact/{kind}"] = {
      get: {
        tags: ["Artifact download"],
        summary: "Issue a signed download for the artifact bundle for this version",
        parameters: [
          enumParam("kind", "path", "Artifact kind exported for this version", artifactKinds, artifactKinds[0]),
          stringParam("version_id", "query", "Target version id", version.id),
        ],
        responses: okResponse("Signed artifact URL and metadata"),
      },
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: `Model registry · ${version.semver}`,
      version: version.semver,
      description: (deployedChannels.length === 0
        ? "This version is not yet deployed. Endpoints are listed for reference; calls will return empty results until the version is promoted to a channel."
        : `Endpoints scoped to version ${version.id} on channel(s) ${deployedChannels.join(", ")}.`)
        + "\n\nAuthentication: the Supabase anon key is auto-injected into every Try-it-out request as both the `apikey` header and `Authorization: Bearer` header.",
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        apikey: { type: "apiKey", in: "header", name: "apikey" },
        bearer: { type: "http", scheme: "bearer" },
      },
    },
    security: [{ apikey: [], bearer: [] }],
    paths,
  };
}

function enumParam(name: string, location: "query" | "path", description: string, options: string[], defaultValue: string) {
  const schema: Record<string, unknown> = { type: "string", enum: options };
  if (location !== "path") schema.default = defaultValue;
  return {
    name,
    in: location,
    required: location === "path",
    description,
    example: defaultValue,
    schema,
  };
}

function stringParam(name: string, location: "query" | "path", description: string, defaultValue: string) {
  const schema: Record<string, unknown> = { type: "string" };
  if (location !== "path" && defaultValue) schema.default = defaultValue;
  return {
    name,
    in: location,
    required: location === "path",
    description,
    example: defaultValue,
    schema,
  };
}

function okResponse(description: string, example?: unknown) {
  const media: Record<string, unknown> = {
    schema: { type: "object" },
  };
  if (example) media.example = example;
  return {
    "200": {
      description,
      content: {
        "application/json": media,
      },
    },
  };
}

function responseExample(version: RegistryVersion, kind: "list" | "resolve") {
  const artifact = {
    kind: "tflite",
    r2_key: version.tfliteR2Key,
    precision: version.tflitePrecision ?? "int8",
    quantized: (version.tflitePrecision ?? "int8") !== "fp32",
    quantization: {
      precision: version.tflitePrecision ?? "int8",
      method: (version.tflitePrecision ?? "int8") === "fp32" ? "none" : "post_training_static",
    },
    size_bytes: Math.round(version.sizeMb * 1024 * 1024),
    content_hash: version.contentHash,
  };
  const metadata = {
    task: "segmentation",
    class_names: version.classes,
    input_size: version.hyperParameters.imgsz,
    export_options: {
      android: { quantize: (version.tflitePrecision ?? "int8") !== "fp32" },
      ios: { quantize: (version.coremlPrecision ?? "fp16") !== "fp32" },
    },
    mobile_exports: {
      android: {
        artifact_kind: "tflite",
        format: "tf_lite",
        precision: artifact.precision,
        quantize: artifact.quantized,
        quantization: artifact.quantization,
      },
      ios: {
        artifact_kind: "coreml",
        format: "core_ml",
        precision: version.coremlPrecision ?? "fp16",
        quantize: (version.coremlPrecision ?? "fp16") !== "fp32",
      },
    },
  };
  if (kind === "list") {
    return {
      model_line: "seeds-poc",
      channel: "staging",
      platform: "android",
      models: [{
        version_id: version.id,
        semver: version.semver,
        status: "ready",
        artifact_kind: "tflite",
        precision: artifact.precision,
        quantization: artifact.quantization,
        artifact,
        metadata,
      }],
    };
  }
  return {
    action: "update",
    version_id: version.id,
    semver: version.semver,
    platform: "android",
    artifact_kind: "tflite",
    model_url: "https://example.invalid/signed-download",
    precision: artifact.precision,
    quantization: artifact.quantization,
    artifact,
    metadata,
  };
}
