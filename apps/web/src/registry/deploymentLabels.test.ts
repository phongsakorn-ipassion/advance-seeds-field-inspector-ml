import { describe, expect, it } from "vitest";
import { deploymentLabelsForVersion } from "./deploymentLabels";
import type { RegistryDeployment } from "./types";

describe("deploymentLabelsForVersion", () => {
  it("marks the default deployment beside its channel", () => {
    const deployments: RegistryDeployment[] = [
      { id: "dep-a", channel: "staging", versionId: "model-a", isDefault: true, deployedAt: "2026-05-22" },
      { id: "dep-b", channel: "production", versionId: "model-a", isDefault: false, deployedAt: "2026-05-22" },
      { id: "dep-c", channel: "staging", versionId: "model-b", isDefault: false, deployedAt: "2026-05-22" },
    ];

    expect(deploymentLabelsForVersion("model-a", deployments)).toEqual([
      { channel: "production", isDefault: false },
      { channel: "staging", isDefault: true },
    ]);
  });
});
