export type ChannelName = "staging" | "production";
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type VersionState = "candidate" | "staging" | "production" | "inactive" | "archived";

export type HyperParameters = {
  epochs: number;
  imgsz: number;
  batch: string;
  patience: number;
  optimizer: string;
  lr0: number;
  lrf: number;
  momentum: number;
  weightDecay: number;
  warmupEpochs: number;
  cosLr: boolean;
  closeMosaic: number;
  mosaic: number;
  mixup: number;
  copyPaste: number;
  scale: number;
  translate: number;
  fliplr: number;
  flipud: number;
  degrees: number;
  shear: number;
  hsvH: number;
  hsvS: number;
  hsvV: number;
  maskRatio: number;
  overlapMask: boolean;
  box: number;
  cls: number;
  multiScale: number;
};

export type TrainConfig = {
  modelLine: string;
  dataset: string;
  datasetBundle?: string;
  datasetBundleFilename?: string;
  datasetBundleSizeBytes?: number;
  datasetBundleDeletedAt?: string;
  datasetBundleDeletedKey?: string;
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
  pytorchR2Key?: string | null;
  pytorchSizeMb?: number | null;
  pytorchContentHash?: string | null;
  pytorchPrecision?: string | null;
  compatSignature: string;
  createdAt: string;
  description?: string;
  originalSemver?: string;
};

export type StorageObject = {
  id: string;
  versionId: string;
  key: string;
  kind: "tflite" | "coreml" | "pytorch" | "metadata";
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
