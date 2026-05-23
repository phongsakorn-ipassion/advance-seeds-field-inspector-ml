import { describe, expect, it } from "vitest";
import { createDemoStore } from "./demoStore";

describe("deployment defaults", () => {
  it("keeps the existing channel default when deploying another model", async () => {
    const store = createDemoStore();

    await store.deployVersion("version-old-v1-070", "staging");

    const snapshot = store.getSnapshot();
    expect(snapshot.channels.find((channel) => channel.name === "staging")?.versionId).toBe("version-seeds-v2-100");
    expect(snapshot.deployments.find((deployment) => deployment.channel === "staging" && deployment.versionId === "version-seeds-v2-100")?.isDefault).toBe(true);
    expect(snapshot.deployments.find((deployment) => deployment.channel === "staging" && deployment.versionId === "version-old-v1-070")?.isDefault).toBe(false);
  });

  it("can promote a deployed model to channel default", async () => {
    const store = createDemoStore();
    await store.deployVersion("version-old-v1-070", "staging");

    await store.setChannelDefault("staging", "version-old-v1-070");

    const snapshot = store.getSnapshot();
    expect(snapshot.channels.find((channel) => channel.name === "staging")?.versionId).toBe("version-old-v1-070");
    expect(snapshot.deployments.find((deployment) => deployment.channel === "staging" && deployment.versionId === "version-seeds-v2-100")?.isDefault).toBe(false);
    expect(snapshot.deployments.find((deployment) => deployment.channel === "staging" && deployment.versionId === "version-old-v1-070")?.isDefault).toBe(true);
  });
});
