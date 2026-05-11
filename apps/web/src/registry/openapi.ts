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
        responses: okResponse("Array of selectable models"),
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
        responses: okResponse("Resolved model with artifact URLs or up_to_date status"),
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
      description: deployedChannels.length === 0
        ? "This version is not yet deployed. Endpoints are listed for reference; calls will return empty results until the version is promoted to a channel."
        : `Endpoints scoped to version ${version.id} on channel(s) ${deployedChannels.join(", ")}.`,
    },
    servers: [{ url: serverUrl }],
    paths,
  };
}

function enumParam(name: string, location: "query" | "path", description: string, options: string[], defaultValue: string) {
  return {
    name,
    in: location,
    required: location === "path",
    description,
    schema: { type: "string", enum: options, default: defaultValue },
  };
}

function stringParam(name: string, location: "query" | "path", description: string, defaultValue: string) {
  return {
    name,
    in: location,
    required: location === "path",
    description,
    schema: { type: "string", default: defaultValue },
  };
}

function okResponse(description: string) {
  return {
    "200": {
      description,
      content: {
        "application/json": {
          schema: { type: "object" },
        },
      },
    },
  };
}
