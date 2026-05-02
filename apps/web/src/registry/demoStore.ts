import type { RegistryStore } from "./api";
import type {
  AuthSession,
  ChannelName,
  RegistryRun,
  RegistrySnapshot,
  TrainConfig,
} from "./types";

export const demoAdmin = {
  email: "admin@advance-seeds.demo",
  password: "demo-admin",
};

export const defaultConfig: TrainConfig = {
  modelLine: "seeds-poc",
  dataset: "configs/dataset.banana-v2.yaml",
  sourceWeights: "yolo26n-seg.pt",
  classes: ["apple", "apple_spot", "banana", "banana_spot", "orange", "orange_spot"],
  hyperParameters: {
    epochs: 50,
    imgsz: 640,
    batch: "auto",
    patience: 12,
    lr0: 0.001,
    lrf: 0.01,
    mosaic: 0.7,
    mixup: 0.1,
    copyPaste: 0.1,
  },
  colabAccelerator: "T4",
};

const initialSnapshot: RegistrySnapshot = {
  quotaMb: 32,
  channels: [
    { name: "staging", versionId: "version-banana-v2-100", updatedAt: "2026-05-02 11:18", updatedBy: "training-sdk" },
    { name: "production", versionId: "version-banana-v1-092", updatedAt: "2026-05-01 18:42", updatedBy: "operator" },
  ],
  runs: [
    {
      id: "run-banana-v2-041",
      name: "banana-v2-poc",
      status: "succeeded",
      modelLine: "seeds-poc",
      dataset: "configs/dataset.banana-v2.yaml",
      hardware: "Colab T4",
      startedAt: "2026-05-02 09:12",
      finishedAt: "2026-05-02 10:47",
      progress: 100,
      map50: 0.88,
      maskMap: 0.82,
      config: defaultConfig,
      colabNotebook: "Colab MCP / banana-v2-poc.ipynb",
      logs: ["Mounted workspace", "Prepared banana-v2 data", "Epoch 50/50 complete", "Exported TFLite artifact"],
    },
    {
      id: "run-banana-v2-042",
      name: "banana-v2-quantized-check",
      status: "running",
      modelLine: "seeds-poc",
      dataset: "configs/dataset.banana-v2.yaml",
      hardware: "Colab L4",
      startedAt: "2026-05-02 11:28",
      finishedAt: null,
      progress: 62,
      map50: 0.84,
      maskMap: 0.78,
      config: { ...defaultConfig, colabAccelerator: "L4" },
      colabNotebook: "Colab MCP / banana-v2-quantized-check.ipynb",
      logs: ["Runtime set to L4", "Epoch 31/50", "mAP50=0.84 mask_mAP=0.78"],
    },
  ],
  versions: [
    {
      id: "version-banana-v2-100",
      semver: "1.0.0-banana-v2",
      runId: "run-banana-v2-041",
      state: "staging",
      sourceWeights: "yolo26n-seg.pt",
      dataset: "configs/dataset.banana-v2.yaml",
      classes: defaultConfig.classes,
      hyperParameters: defaultConfig.hyperParameters,
      map50: 0.88,
      maskMap: 0.82,
      sizeMb: 12.4,
      contentHash: "sha256:357e5d6f...",
      compatSignature: "0256a143...a5f1a28d1",
      createdAt: "2026-05-02 10:51",
    },
    {
      id: "version-banana-v1-092",
      semver: "0.9.2-banana-v1",
      runId: "run-banana-v1-039",
      state: "production",
      sourceWeights: "yolo26n-seg.pt",
      dataset: "configs/dataset.banana-v1.yaml",
      classes: defaultConfig.classes,
      hyperParameters: { ...defaultConfig.hyperParameters, epochs: 40, mosaic: 0.5 },
      map50: 0.81,
      maskMap: 0.75,
      sizeMb: 12.1,
      contentHash: "sha256:94a772bb...",
      compatSignature: "0256a143...a5f1a28d1",
      createdAt: "2026-05-01 15:58",
    },
    {
      id: "version-old-v1-070",
      semver: "0.7.0-archive",
      runId: "run-old-070",
      state: "inactive",
      sourceWeights: "yolo26n-seg.pt",
      dataset: "configs/dataset.banana-v1.yaml",
      classes: defaultConfig.classes,
      hyperParameters: { ...defaultConfig.hyperParameters, epochs: 25 },
      map50: 0.74,
      maskMap: 0.69,
      sizeMb: 10.8,
      contentHash: "sha256:7110a0ed...",
      compatSignature: "0256a143...a5f1a28d1",
      createdAt: "2026-04-30 12:22",
    },
  ],
  storage: [
    { id: "artifact-v2-tflite", versionId: "version-banana-v2-100", key: "runs/run-banana-v2-041/1.0.0-banana-v2.tflite", kind: "tflite", sizeMb: 12.4, active: true },
    { id: "artifact-v1-tflite", versionId: "version-banana-v1-092", key: "runs/run-banana-v1-039/0.9.2-banana-v1.tflite", kind: "tflite", sizeMb: 12.1, active: true },
    { id: "artifact-old-tflite", versionId: "version-old-v1-070", key: "runs/run-old-070/0.7.0-archive.tflite", kind: "tflite", sizeMb: 10.8, active: false },
  ],
};

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

export function createDemoStore(): RegistryStore {
  let snapshot: RegistrySnapshot = structuredClone(initialSnapshot);
  let session: AuthSession | null = null;
  const dataListeners = new Set<() => void>();
  const authListeners = new Set<() => void>();

  function notifyData() { dataListeners.forEach((fn) => fn()); }
  function notifyAuth() { authListeners.forEach((fn) => fn()); }

  function setSnapshot(next: RegistrySnapshot) {
    snapshot = next;
    notifyData();
  }

  function advance() {
    let changed = false;
    const completed: RegistryRun[] = [];
    const nextRuns = snapshot.runs.map((run) => {
      if (run.status !== "running") return run;
      changed = true;
      const progress = Math.min(100, run.progress + 7);
      const map50 = Math.min(0.91, (run.map50 ?? 0.35) + 0.025);
      const maskMap = Math.min(0.84, (run.maskMap ?? 0.31) + 0.022);
      if (progress >= 100) {
        const done: RegistryRun = {
          ...run, progress, map50, maskMap,
          status: "succeeded", finishedAt: nowStamp(),
          logs: [...run.logs, "Epochs complete", "Artifact uploaded through signed R2 URL"],
        };
        completed.push(done);
        return done;
      }
      return {
        ...run, progress, map50, maskMap,
        logs: [...run.logs.slice(-4), `Epoch progress ${progress}% / mAP50=${map50.toFixed(2)} mask=${maskMap.toFixed(2)}`],
      };
    });
    if (!changed) return;
    if (completed.length === 0) {
      setSnapshot({ ...snapshot, runs: nextRuns });
      return;
    }
    const newVersions = completed.map((run) => {
      const semver = `1.0.${snapshot.versions.length + 1}-${run.id.slice(-4)}`;
      return {
        id: `version-${run.id}`,
        semver,
        runId: run.id,
        state: "candidate" as const,
        sourceWeights: run.config.sourceWeights,
        dataset: run.config.dataset,
        classes: run.config.classes,
        hyperParameters: run.config.hyperParameters,
        map50: run.map50 ?? 0,
        maskMap: run.maskMap ?? 0,
        sizeMb: 12.2,
        contentHash: `sha256:${run.id.slice(-8)}...`,
        compatSignature: "0256a143...a5f1a28d1",
        createdAt: nowStamp(),
      };
    });
    setSnapshot({
      ...snapshot,
      runs: nextRuns,
      versions: [...newVersions, ...snapshot.versions],
      storage: [
        ...newVersions.map((v) => ({
          id: `artifact-${v.id}`,
          versionId: v.id,
          key: `runs/${v.runId}/${v.semver}.tflite`,
          kind: "tflite" as const,
          sizeMb: v.sizeMb,
          active: false,
        })),
        ...snapshot.storage,
      ],
    });
  }

  if (typeof window !== "undefined") {
    window.setInterval(advance, 1500);
  }

  return {
    mode: "demo",
    getSnapshot: () => snapshot,
    subscribe(listener) {
      dataListeners.add(listener);
      return () => dataListeners.delete(listener);
    },
    async refresh() { /* no-op in demo */ },
    getSession: () => session,
    async signIn(email, password) {
      if (email === demoAdmin.email && password === demoAdmin.password) {
        session = { email, isAdmin: true };
        notifyAuth();
        return;
      }
      throw new Error("Invalid demo admin credentials.");
    },
    async signOut() {
      session = null;
      notifyAuth();
    },
    subscribeAuth(listener) {
      authListeners.add(listener);
      return () => authListeners.delete(listener);
    },
    async startTraining(config) {
      const now = new Date();
      const id = `run-${now.getTime()}`;
      const run: RegistryRun = {
        id,
        name: `${config.dataset.split("/").pop()?.replace(".yaml", "") ?? "model"}-${now.getHours()}${now.getMinutes()}`,
        status: "running",
        modelLine: config.modelLine,
        dataset: config.dataset,
        hardware: `Colab ${config.colabAccelerator}`,
        startedAt: nowStamp(),
        finishedAt: null,
        progress: 4,
        map50: 0.35,
        maskMap: 0.31,
        config,
        colabNotebook: `Colab MCP / ${id}.ipynb`,
        logs: [
          `Runtime requested: ${config.colabAccelerator}`,
          "Notebook cells prepared through Colab MCP",
          "Training command queued",
        ],
      };
      setSnapshot({ ...snapshot, runs: [run, ...snapshot.runs] });
    },
    async deployVersion(versionId, channel) {
      setSnapshot({
        ...snapshot,
        channels: snapshot.channels.map((c) =>
          c.name === channel
            ? { ...c, versionId, updatedAt: nowStamp(), updatedBy: session?.email ?? "demo-admin" }
            : c,
        ),
        versions: snapshot.versions.map((v) => ({
          ...v,
          state: v.id === versionId ? channel : v.state === channel ? "candidate" : v.state,
        })),
        storage: snapshot.storage.map((it) => (it.versionId === versionId ? { ...it, active: true } : it)),
      });
    },
    async undeployChannel(channel) {
      const oldVersionId = snapshot.channels.find((c) => c.name === channel)?.versionId;
      setSnapshot({
        ...snapshot,
        channels: snapshot.channels.map((c) =>
          c.name === channel
            ? { ...c, versionId: null, updatedAt: nowStamp(), updatedBy: session?.email ?? "demo-admin" }
            : c,
        ),
        versions: snapshot.versions.map((v) =>
          v.id === oldVersionId ? { ...v, state: v.state === channel ? "candidate" : v.state } : v,
        ),
      });
    },
    async deleteInactiveArtifact(storageId) {
      setSnapshot({ ...snapshot, storage: snapshot.storage.filter((it) => it.id !== storageId) });
    },
  };
}
