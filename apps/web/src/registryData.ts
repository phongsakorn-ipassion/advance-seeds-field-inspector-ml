export type ChannelName = "staging" | "production";
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type VersionState = "candidate" | "staging" | "production" | "inactive";

export type HyperParameters = {
  epochs: number;
  imgsz: number;
  batch: string;
  patience: number;
  lr0: number;
  lrf: number;
  mosaic: number;
  mixup: number;
  copyPaste: number;
};

export type TrainConfig = {
  modelLine: string;
  dataset: string;
  sourceWeights: string;
  classes: string[];
  hyperParameters: HyperParameters;
  colabAccelerator: "T4" | "L4" | "A100";
};

export type RegistryChannel = {
  name: ChannelName;
  versionId: string | null;
  updatedAt: string;
  updatedBy: string;
};

export type RegistryRun = {
  id: string;
  name: string;
  status: RunStatus;
  modelLine: string;
  dataset: string;
  hardware: string;
  startedAt: string;
  finishedAt: string | null;
  progress: number;
  map50: number | null;
  maskMap: number | null;
  config: TrainConfig;
  colabNotebook: string;
  logs: string[];
};

export type RegistryVersion = {
  id: string;
  semver: string;
  runId: string;
  state: VersionState;
  sourceWeights: string;
  dataset: string;
  classes: string[];
  hyperParameters: HyperParameters;
  map50: number;
  maskMap: number;
  sizeMb: number;
  contentHash: string;
  compatSignature: string;
  createdAt: string;
};

export type StorageObject = {
  id: string;
  versionId: string;
  key: string;
  kind: "tflite" | "coreml" | "metadata";
  sizeMb: number;
  active: boolean;
};

export type RegistryState = {
  adminEmail: string | null;
  channels: RegistryChannel[];
  runs: RegistryRun[];
  versions: RegistryVersion[];
  storage: StorageObject[];
  quotaMb: number;
};

export const demoAdmin = {
  email: "admin@advance-seeds.demo",
  password: "demo-admin",
  role: "admin",
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

export const initialState: RegistryState = {
  adminEmail: null,
  quotaMb: 32,
  channels: [
    {
      name: "staging",
      versionId: "version-banana-v2-100",
      updatedAt: "2026-05-02 11:18",
      updatedBy: "training-sdk",
    },
    {
      name: "production",
      versionId: "version-banana-v1-092",
      updatedAt: "2026-05-01 18:42",
      updatedBy: "operator",
    },
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
    {
      id: "artifact-v2-tflite",
      versionId: "version-banana-v2-100",
      key: "runs/run-banana-v2-041/1.0.0-banana-v2.tflite",
      kind: "tflite",
      sizeMb: 12.4,
      active: true,
    },
    {
      id: "artifact-v1-tflite",
      versionId: "version-banana-v1-092",
      key: "runs/run-banana-v1-039/0.9.2-banana-v1.tflite",
      kind: "tflite",
      sizeMb: 12.1,
      active: true,
    },
    {
      id: "artifact-old-tflite",
      versionId: "version-old-v1-070",
      key: "runs/run-old-070/0.7.0-archive.tflite",
      kind: "tflite",
      sizeMb: 10.8,
      active: false,
    },
  ],
};
