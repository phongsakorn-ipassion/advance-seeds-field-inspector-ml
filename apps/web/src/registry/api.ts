import type {
  AuthSession,
  ChannelName,
  RegistrySnapshot,
  TrainConfig,
} from "./types";

export type StoreMode = "demo" | "supabase";

export type RegistryStore = {
  mode: StoreMode;
  getSnapshot(): RegistrySnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;

  // Auth
  getSession(): AuthSession | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  subscribeAuth(listener: () => void): () => void;

  // Writes
  startTraining(config: TrainConfig): Promise<void>;
  deployVersion(versionId: string, channel: ChannelName): Promise<void>;
  undeployChannel(channel: ChannelName): Promise<void>;
  deleteInactiveArtifact(storageId: string): Promise<void>;

  // Dataset upload (returns the R2 key the dashboard records)
  uploadDataset(file: File, modelLineSlug: string): Promise<{ r2Key: string }>;
};

export class AuthError extends Error {}
export class WriteError extends Error {}
