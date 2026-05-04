export type ChannelName = "staging" | "production";
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type VersionState = "candidate" | "staging" | "production" | "inactive" | "archived";

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
  datasetBundle?: string;
  datasetBundleFilename?: string;
  datasetBundleSizeBytes?: number;
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

export type RegistryDeployment = {
  id: string;
  channel: ChannelName;
  versionId: string;
  isDefault: boolean;
  deployedAt: string;
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
  tfliteR2Key: string;
  tflitePrecision?: string | null;
  coremlR2Key?: string | null;
  coremlSizeMb?: number | null;
  coremlContentHash?: string | null;
  coremlPrecision?: string | null;
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
  deployments: RegistryDeployment[];
  runs: RegistryRun[];
  versions: RegistryVersion[];
  storage: StorageObject[];
  quotaMb: number;
};

export type AuthSession = {
  userId?: string;
  email: string;
  isAdmin: boolean;
};
