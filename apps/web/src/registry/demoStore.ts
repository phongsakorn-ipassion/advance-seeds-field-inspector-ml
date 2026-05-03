import type { RegistryStore } from "./api";
import type {
  AuthSession,
  ChannelName,
  DatasetStats,
  RegistryRun,
  RegistrySnapshot,
  TrainConfig,
} from "./types";

export const demoAdmin = {
  email: "admin@advance-seeds.demo",
  password: "demo-admin",
};

const seedsV2Stats: DatasetStats = {
  total: 1841,
  train: 1473,
  validation: 276,
  testing: 92,
  trainPath: "data/processed/seeds-v2/images/train",
  validationPath: "data/processed/seeds-v2/images/val",
  testingPath: "data/processed/seeds-v2/images/test",
};

const seedsV1Stats: DatasetStats = {
  total: 1216,
  train: 973,
  validation: 182,
  testing: 61,
  trainPath: "data/processed/seeds-v1/images/train",
  validationPath: "data/processed/seeds-v1/images/val",
  testingPath: "data/processed/seeds-v1/images/test",
};

export const defaultConfig: TrainConfig = {
  modelLine: "seeds-poc",
  dataset: "",
  datasetStats: undefined,
  sourceWeights: "yolo26n-seg.pt",
  classes: [],
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
  note: "",
};

const initialSnapshot: RegistrySnapshot = {
  quotaMb: 512,
  channels: [
    { name: "staging", versionId: "version-seeds-v2-100", updatedAt: "2026-05-02 11:18", updatedBy: "training-sdk" },
    { name: "production", versionId: "version-seeds-v1-092", updatedAt: "2026-05-01 18:42", updatedBy: "operator" },
  ],
  deployments: [
    { id: "deployment-staging-v2", channel: "staging", versionId: "version-seeds-v2-100", isDefault: true, deployedAt: "2026-05-02 11:18" },
    { id: "deployment-production-v1", channel: "production", versionId: "version-seeds-v1-092", isDefault: true, deployedAt: "2026-05-01 18:42" },
  ],
  runs: [
    {
      id: "run-seeds-v2-041",
      name: "seeds-v2-poc",
      status: "succeeded",
      modelLine: "seeds-poc",
      dataset: "configs/dataset.seeds-v2.yaml",
      datasetStats: seedsV2Stats,
      hardware: "Colab T4",
      startedAt: "2026-05-02 09:12",
      finishedAt: "2026-05-02 10:47",
      progress: 100,
      map50: 0.88,
      maskMap: 0.82,
      config: defaultConfig,
      colabNotebook: "Colab MCP / seeds-v2-poc.ipynb",
      logs: ["Mounted workspace", "Prepared dataset images", "Epoch 50/50 complete", "Exported TFLite artifact"],
    },
    {
      id: "run-seeds-v2-042",
      name: "seeds-v2-quantized-check",
      status: "running",
      modelLine: "seeds-poc",
      dataset: "configs/dataset.seeds-v2.yaml",
      datasetStats: seedsV2Stats,
      hardware: "Colab L4",
      startedAt: "2026-05-02 11:28",
      finishedAt: null,
      progress: 62,
      map50: 0.84,
      maskMap: 0.78,
      config: { ...defaultConfig, colabAccelerator: "L4" },
      colabNotebook: "Colab MCP / seeds-v2-quantized-check.ipynb",
      logs: ["Runtime set to L4", "Epoch 31/50", "mAP50=0.84 mask_mAP=0.78"],
    },
  ],
  versions: [
    {
      id: "version-seeds-v2-100",
      semver: "1.0.0-seeds-v2",
      runId: "run-seeds-v2-041",
      state: "staging",
      sourceWeights: "yolo26n-seg.pt",
      dataset: "configs/dataset.seeds-v2.yaml",
      datasetStats: seedsV2Stats,
      classes: defaultConfig.classes,
      hyperParameters: defaultConfig.hyperParameters,
      map50: 0.88,
      maskMap: 0.82,
      sizeMb: 12.4,
      contentHash: "sha256:357e5d6f...",
      tfliteR2Key: "runs/run-seeds-v2-041/1.0.0-seeds-v2.tflite",
      tflitePrecision: "int8",
      coremlR2Key: "runs/run-seeds-v2-041/1.0.0-seeds-v2.mlpackage.zip",
      coremlSizeMb: 18.7,
      coremlContentHash: "sha256:coreml357e...",
      coremlPrecision: "fp16",
      compatSignature: "0256a143...a5f1a28d1",
      createdAt: "2026-05-02 10:51",
    },
    {
      id: "version-seeds-v1-092",
      semver: "0.9.2-seeds-v1",
      runId: "run-seeds-v1-039",
      state: "production",
      sourceWeights: "yolo26n-seg.pt",
      dataset: "configs/dataset.seeds-v1.yaml",
      datasetStats: seedsV1Stats,
      classes: defaultConfig.classes,
      hyperParameters: { ...defaultConfig.hyperParameters, epochs: 40, mosaic: 0.5 },
      map50: 0.81,
      maskMap: 0.75,
      sizeMb: 12.1,
      contentHash: "sha256:94a772bb...",
      tfliteR2Key: "runs/run-seeds-v1-039/0.9.2-seeds-v1.tflite",
      tflitePrecision: "int8",
      coremlR2Key: null,
      coremlSizeMb: null,
      coremlContentHash: null,
      coremlPrecision: null,
      compatSignature: "0256a143...a5f1a28d1",
      createdAt: "2026-05-01 15:58",
    },
    {
      id: "version-old-v1-070",
      semver: "0.7.0-archive",
      runId: "run-old-070",
      state: "inactive",
      sourceWeights: "yolo26n-seg.pt",
      dataset: "configs/dataset.seeds-v1.yaml",
      datasetStats: seedsV1Stats,
      classes: defaultConfig.classes,
      hyperParameters: { ...defaultConfig.hyperParameters, epochs: 25 },
      map50: 0.74,
      maskMap: 0.69,
      sizeMb: 10.8,
      contentHash: "sha256:7110a0ed...",
      tfliteR2Key: "runs/run-old-070/0.7.0-archive.tflite",
      tflitePrecision: "int8",
      coremlR2Key: null,
      coremlSizeMb: null,
      coremlContentHash: null,
      coremlPrecision: null,
      compatSignature: "0256a143...a5f1a28d1",
      createdAt: "2026-04-30 12:22",
    },
  ],
  storage: [
    { id: "artifact-v2-tflite", versionId: "version-seeds-v2-100", key: "runs/run-seeds-v2-041/1.0.0-seeds-v2.tflite", kind: "tflite", sizeMb: 12.4, active: true },
    { id: "artifact-v2-coreml", versionId: "version-seeds-v2-100", key: "runs/run-seeds-v2-041/1.0.0-seeds-v2.mlpackage.zip", kind: "coreml", sizeMb: 18.7, active: true },
    { id: "artifact-v1-tflite", versionId: "version-seeds-v1-092", key: "runs/run-seeds-v1-039/0.9.2-seeds-v1.tflite", kind: "tflite", sizeMb: 12.1, active: true },
    { id: "artifact-old-tflite", versionId: "version-old-v1-070", key: "runs/run-old-070/0.7.0-archive.tflite", kind: "tflite", sizeMb: 10.8, active: false },
  ],
};

const DEMO_SNAPSHOT_KEY = "advance-seeds:model-registry:demo-snapshot:v2";

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function formatRunTimestamp(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function loadPersistedSnapshot(): RegistrySnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEMO_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RegistrySnapshot>;
    if (!Array.isArray(parsed.runs) || !Array.isArray(parsed.versions) || !Array.isArray(parsed.channels) || !Array.isArray(parsed.storage)) {
      return null;
    }
    return {
      quotaMb: initialSnapshot.quotaMb,
      channels: parsed.channels,
      runs: parsed.runs,
      versions: parsed.versions,
      deployments: parsed.deployments ?? initialSnapshot.deployments,
      storage: parsed.storage,
    };
  } catch {
    return null;
  }
}

function persistSnapshot(snapshot: RegistrySnapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEMO_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota/privacy-mode failures; demo mode can still run in memory.
  }
}

export function createDemoStore(): RegistryStore {
  let snapshot: RegistrySnapshot = loadPersistedSnapshot() ?? structuredClone(initialSnapshot);
  let session: AuthSession | null = null;
  const dataListeners = new Set<() => void>();
  const authListeners = new Set<() => void>();

  function notifyData() { dataListeners.forEach((fn) => fn()); }
  function notifyAuth() { authListeners.forEach((fn) => fn()); }

  function setSnapshot(next: RegistrySnapshot) {
    snapshot = next;
    persistSnapshot(snapshot);
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
      const totalEpochs = run.config.hyperParameters.epochs || 1;
      const epoch = Math.max(1, Math.min(totalEpochs, Math.ceil((progress / 100) * totalEpochs)));
      return {
        ...run, progress, map50, maskMap,
        logs: [...run.logs.slice(-49), `Epoch ${epoch}/${totalEpochs} (${progress}%) / mAP50=${map50.toFixed(2)} mask=${maskMap.toFixed(2)}`],
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
        datasetStats: run.config.datasetStats,
        classes: run.config.classes,
        hyperParameters: run.config.hyperParameters,
        map50: run.map50 ?? 0,
        maskMap: run.maskMap ?? 0,
        sizeMb: 12.2,
        contentHash: `sha256:${run.id.slice(-8)}...`,
        tfliteR2Key: `runs/${run.id}/${semver}.tflite`,
        tflitePrecision: "int8",
        coremlR2Key: `runs/${run.id}/${semver}.mlpackage.zip`,
        coremlSizeMb: 18.4,
        coremlContentHash: `sha256:coreml-${run.id.slice(-8)}...`,
        coremlPrecision: "fp16",
        compatSignature: "0256a143...a5f1a28d1",
        createdAt: nowStamp(),
        description: "",
        originalSemver: semver,
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
          key: v.tfliteR2Key,
          kind: "tflite" as const,
          sizeMb: v.sizeMb,
          active: false,
        })),
        ...newVersions.map((v) => ({
          id: `artifact-${v.id}-coreml`,
          versionId: v.id,
          key: v.coremlR2Key ?? `runs/${v.runId}/${v.semver}.mlpackage.zip`,
          kind: "coreml" as const,
          sizeMb: v.coremlSizeMb ?? 18.4,
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
    async deleteRun(runId) {
      setSnapshot({
        ...snapshot,
        runs: snapshot.runs.filter((r) => r.id !== runId),
      });
    },
    async startTraining(config) {
      const now = new Date();
      const id = `run-${now.getTime()}`;
      const stamp = formatRunTimestamp(now);
      const run: RegistryRun = {
        id,
        name: `${config.dataset.split("/").pop()?.replace(".yaml", "") ?? "model"}-${stamp}`,
        status: "running",
        modelLine: config.modelLine,
        dataset: config.dataset,
        datasetStats: config.datasetStats,
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
    async deployVersion(versionId, channel, options) {
      const target = snapshot.versions.find((v) => v.id === versionId);
      if (target?.state === "archived") throw new Error("Archived models cannot be deployed.");
      const setDefault = options?.setDefault ?? true;
      const deploymentId = `deployment-${channel}-${versionId}`;
      setSnapshot({
        ...snapshot,
        channels: snapshot.channels.map((c) =>
          c.name === channel && setDefault
            ? { ...c, versionId, updatedAt: nowStamp(), updatedBy: session?.email ?? "demo-admin" }
            : c,
        ),
        deployments: [
          ...snapshot.deployments.filter((d) => !(d.channel === channel && d.versionId === versionId)),
          { id: deploymentId, channel, versionId, isDefault: setDefault, deployedAt: nowStamp() },
        ].map((d) => d.channel === channel ? { ...d, isDefault: d.versionId === versionId ? setDefault : false } : d),
        versions: snapshot.versions.map((v) => ({
          ...v,
          state: v.id === versionId ? channel : v.state === channel ? "candidate" : v.state,
        })),
        storage: snapshot.storage.map((it) => (it.versionId === versionId ? { ...it, active: true } : it)),
      });
    },
    async undeployChannel(channel, versionId) {
      const oldVersionId = versionId ?? snapshot.channels.find((c) => c.name === channel)?.versionId;
      const replacement = snapshot.deployments.find((d) => d.channel === channel && d.versionId !== oldVersionId);
      setSnapshot({
        ...snapshot,
        channels: snapshot.channels.map((c) =>
          c.name === channel
            ? { ...c, versionId: replacement?.versionId ?? null, updatedAt: nowStamp(), updatedBy: session?.email ?? "demo-admin" }
            : c,
        ),
        deployments: snapshot.deployments
          .filter((d) => !(d.channel === channel && d.versionId === oldVersionId))
          .map((d) => d.channel === channel ? { ...d, isDefault: d.versionId === replacement?.versionId } : d),
        versions: snapshot.versions.map((v) =>
          v.id === oldVersionId ? { ...v, state: v.state === channel ? "candidate" : v.state } : v,
        ),
      });
    },
    async updateVersionDescription(versionId, description) {
      setSnapshot({
        ...snapshot,
        versions: snapshot.versions.map((v) => (v.id === versionId ? { ...v, description } : v)),
      });
    },
    async renameVersion(versionId, semver) {
      const next = semver.trim();
      if (!next) throw new Error("Version name cannot be empty.");
      if (snapshot.versions.some((v) => v.id !== versionId && v.semver === next)) {
        throw new Error(`Version "${next}" already exists.`);
      }
      setSnapshot({
        ...snapshot,
        versions: snapshot.versions.map((v) =>
          v.id === versionId
            ? { ...v, semver: next, originalSemver: v.originalSemver ?? v.semver }
            : v,
        ),
        storage: snapshot.storage.map((s) =>
          s.versionId === versionId
            ? { ...s, key: s.key.replace(/[^/]+(\.[^/.]+)?$/, `${next}$1`) }
            : s,
        ),
      });
    },
    async deleteInactiveArtifact(storageId) {
      const item = snapshot.storage.find((it) => it.id === storageId);
      if (!item || item.active) return;
      setSnapshot({
        ...snapshot,
        channels: snapshot.channels.map((channel) =>
          channel.versionId === item.versionId ? { ...channel, versionId: null, updatedAt: nowStamp(), updatedBy: session?.email ?? "demo-admin" } : channel,
        ),
        versions: snapshot.versions.filter((version) => version.id !== item.versionId),
        storage: snapshot.storage.filter((artifact) => artifact.versionId !== item.versionId),
      });
    },
    async archiveVersion(versionId) {
      if (snapshot.channels.some((channel) => channel.versionId === versionId) || snapshot.deployments.some((d) => d.versionId === versionId)) return;
      setSnapshot({
        ...snapshot,
        versions: snapshot.versions.map((version) => (version.id === versionId ? { ...version, state: "archived" } : version)),
        storage: snapshot.storage.filter((artifact) => artifact.versionId !== versionId),
      });
    },
    async uploadDataset(file, modelLineSlug) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      return { r2Key: `datasets/${modelLineSlug}/${stamp}/${file.name}` };
    },
  };
}
