import type { ChannelName, RegistryDeployment } from "./types";

export type DeploymentLabel = {
  channel: ChannelName;
  isDefault: boolean;
};

export function deploymentLabelsForVersion(
  versionId: string,
  deployments: RegistryDeployment[],
): DeploymentLabel[] {
  return deployments
    .filter((deployment) => deployment.versionId === versionId)
    .sort((a, b) => a.channel.localeCompare(b.channel))
    .map((deployment) => ({
      channel: deployment.channel,
      isDefault: deployment.isDefault,
    }));
}
