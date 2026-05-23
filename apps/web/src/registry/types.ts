export type ChannelName = "staging" | "production";
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type VersionState = "candidate" | "staging" | "production" | "inactive" | "archived";

export type MetricKey =
  | "map50"
  | "map5095"
  | "precision"
  | "recall"
  | "maskMap50"
  | "maskMap5095"
  | "maskPrecision"
  | "maskRecall"
  | "f1";

export type MetricPoint = {
  key: MetricKey;
  label: string;
  step: number;
  epoch: number | null;
  value: number;
  rawName: string;
  recordedAt?: string;
};

export type MetricSummary = Partial<Record<MetricKey, number>>;

export type PlatformPrecision = "int8" | "fp16" | "fp32" | "failed";

export type ExportTarget = { quantize: boolean };

export type ExportOptions = {
  ios: ExportTarget;     // default { quantize: true }
  android: ExportTarget; // default { quantize: true }
};

export type RunLogStep = 1 | 2 | 3 | 4 | 5 | 6;
export type RunLogPhase = "dataset-ready" | "model-init" | "training" | "export" | "upload" | null;
export type RunLogStatus = "started" | "ok" | "error" | "info";

export type StructuredRunLogEntry = {
  ts: string;
  step: RunLogStep | null;
  phase: RunLogPhase;
  status: RunLogStatus;
  message: string;
};

export type RunLogEntry = string | StructuredRunLogEntry;

export type HyperParameters = {
  epochs: number;
  imgsz: number;
  batch: string;
  patience: number;
  lr0: number;
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
  note?: string;
  exportOptions?: ExportOptions;
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
  metricsSummary: MetricSummary;
  metricsHistory: MetricPoint[];
  config: TrainConfig;
  colabNotebook: string;
  logs: RunLogEntry[];
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
  exportOptions?: ExportOptions;
  map50: number;
  maskMap: number;
  metricsSummary: MetricSummary;
  sizeMb: number;
  contentHash: string;
  tfliteR2Key: string;
  tflitePrecision?: PlatformPrecision | null;
  coremlR2Key?: string | null;
  coremlSizeMb?: number | null;
  coremlContentHash?: string | null;
  coremlPrecision?: PlatformPrecision | null;
  pytorchR2Key?: string | null;
  pytorchSizeMb?: number | null;
  pytorchContentHash?: string | null;
  pytorchPrecision?: PlatformPrecision | null;
  pytorchInferenceMs?: number | null;
  tfliteInferenceMs?: number | null;
  coremlInferenceMs?: number | null;
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
