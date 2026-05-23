import { describe, expect, it } from "vitest";
import { createDemoStore } from "./demoStore";
import type { TrainConfig } from "./types";

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

describe("startTraining with NMS options", () => {
  it("records ios nms.maxDet=200 in the new run snapshot", async () => {
    const store = createDemoStore();
    const config: TrainConfig = {
      modelLine: "model-line-seeds-v2",
      dataset: "banana.yaml",
      sourceWeights: "yolo26n-seg.pt",
      classes: ["banana"],
      hyperParameters: { epochs: 10, imgsz: 640, batch: "16", patience: 50, lr0: 0.01 },
      exportOptions: {
        ios: { quantize: false, nms: { maxDet: 200, iouThreshold: 0.5, confThreshold: 0.25 } },
        android: { quantize: true },
      },
    };

    await store.startTraining(config);

    const snapshot = store.getSnapshot();
    const newRun = snapshot.runs[0];
    expect(newRun.config.exportOptions?.ios.nms?.maxDet).toBe(200);
  });
});
