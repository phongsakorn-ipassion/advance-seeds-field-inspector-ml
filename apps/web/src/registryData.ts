export type ChannelName = "staging" | "production";
export type RunStatus = "running" | "succeeded" | "failed" | "cancelled";

export type RegistryChannel = {
  name: ChannelName;
  semver: string | null;
  versionId: string | null;
  updatedAt: string;
  updatedBy: string;
  compatSignature: string | null;
};

export type RegistryRun = {
  id: string;
  name: string;
  status: RunStatus;
  modelLine: string;
  hardware: string;
  startedAt: string;
  finishedAt: string | null;
  map50: number | null;
  maskMap: number | null;
};

export type RegistryVersion = {
  id: string;
  semver: string;
  runId: string;
  status: "candidate" | "staging" | "production";
  sourceWeights: string;
  dataset: string;
  map50: number;
  maskMap: number;
  sizeMb: number;
  contentHash: string;
  createdAt: string;
};

export const channels: RegistryChannel[] = [
  {
    name: "staging",
    semver: "1.0.0-banana-v2",
    versionId: "00000000-0000-0000-0000-0000000000bb",
    updatedAt: "2026-05-02 11:18",
    updatedBy: "training-sdk",
    compatSignature: "0256a143...a5f1a28d1",
  },
  {
    name: "production",
    semver: "0.9.2-banana-v1",
    versionId: "00000000-0000-0000-0000-000000000092",
    updatedAt: "2026-05-01 18:42",
    updatedBy: "operator",
    compatSignature: "0256a143...a5f1a28d1",
  },
];

export const runs: RegistryRun[] = [
  {
    id: "run-banana-v2-041",
    name: "banana-v2-poc",
    status: "succeeded",
    modelLine: "seeds-poc",
    hardware: "MPS / 16 GB",
    startedAt: "2026-05-02 09:12",
    finishedAt: "2026-05-02 10:47",
    map50: 0.88,
    maskMap: 0.82,
  },
  {
    id: "run-banana-v2-042",
    name: "banana-v2-quantized-check",
    status: "running",
    modelLine: "seeds-poc",
    hardware: "CUDA / 12 GB",
    startedAt: "2026-05-02 11:28",
    finishedAt: null,
    map50: 0.84,
    maskMap: 0.78,
  },
  {
    id: "run-banana-v1-039",
    name: "banana-v1-baseline",
    status: "succeeded",
    modelLine: "seeds-poc",
    hardware: "CPU / 8 GB",
    startedAt: "2026-05-01 14:05",
    finishedAt: "2026-05-01 15:54",
    map50: 0.81,
    maskMap: 0.75,
  },
];

export const versions: RegistryVersion[] = [
  {
    id: "version-banana-v2-100",
    semver: "1.0.0-banana-v2",
    runId: "run-banana-v2-041",
    status: "staging",
    sourceWeights: "yolo26n-seg.pt",
    dataset: "dataset.banana-v2.yaml",
    map50: 0.88,
    maskMap: 0.82,
    sizeMb: 12.4,
    contentHash: "sha256:357e5d6f...",
    createdAt: "2026-05-02 10:51",
  },
  {
    id: "version-banana-v1-092",
    semver: "0.9.2-banana-v1",
    runId: "run-banana-v1-039",
    status: "production",
    sourceWeights: "yolo26n-seg.pt",
    dataset: "dataset.banana-v1.yaml",
    map50: 0.81,
    maskMap: 0.75,
    sizeMb: 12.1,
    contentHash: "sha256:94a772bb...",
    createdAt: "2026-05-01 15:58",
  },
  {
    id: "version-banana-v2-101",
    semver: "1.0.1-quantized",
    runId: "run-banana-v2-042",
    status: "candidate",
    sourceWeights: "yolo26n-seg.pt",
    dataset: "dataset.banana-v2.yaml",
    map50: 0.84,
    maskMap: 0.78,
    sizeMb: 5.8,
    contentHash: "sha256:8b2c91aa...",
    createdAt: "2026-05-02 11:44",
  },
];
