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
  datasetStats?: DatasetStats;
  sourceWeights: string;
  classes: string[];
  hyperParameters: HyperParameters;
  colabAccelerator: "T4" | "L4" | "A100";
  note?: string;
};

export type DatasetStats = {
  total?: number;
  train?: number;
  validation?: number;
  testing?: number;
  trainPath?: string;
  validationPath?: string;
  testingPath?: string;
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
  datasetStats?: DatasetStats;
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
  datasetStats?: DatasetStats;
  classes: string[];
  hyperParameters: HyperParameters;
  map50: number;
  maskMap: number;
  sizeMb: number;
  contentHash: string;
  compatSignature: string;
  createdAt: string;
  description?: string;
  originalSemver?: string;
};

export type StorageObject = {
  id: string;
  versionId: string;
  key: string;
  kind: "tflite" | "coreml" | "metadata";
  sizeMb: number;
  active: boolean;
};

export type RegistrySnapshot = {
  channels: RegistryChannel[];
  runs: RegistryRun[];
  versions: RegistryVersion[];
  storage: StorageObject[];
  quotaMb: number;
};

export type AuthSession = {
  email: string;
  isAdmin: boolean;
};
