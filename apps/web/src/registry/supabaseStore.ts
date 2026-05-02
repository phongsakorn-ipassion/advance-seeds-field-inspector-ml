import { createClient, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { RegistryStore } from "./api";
import type {
  AuthSession,
  ChannelName,
  HyperParameters,
  RegistryChannel,
  RegistryRun,
  RegistrySnapshot,
  RegistryVersion,
  StorageObject,
  TrainConfig,
  VersionState,
} from "./types";

type Env = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  modelLineSlug: string;
  quotaMb: number;
};

type DbModelLine = { id: string; slug: string; display_name: string };

type DbRun = {
  id: string;
  model_line_id: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  config_yaml: any;
  started_at: string;
  finished_at: string | null;
  hardware: any;
};

type DbRunMetric = {
  run_id: string;
  step: number;
  epoch: number | null;
  name: string;
  value: number;
};

type DbVersion = {
  id: string;
  run_id: string | null;
  model_line_id: string;
  semver: string;
  compat_signature: string | null;
  metadata: any;
  tflite_r2_key: string;
  mlmodel_r2_key: string | null;
  size_bytes: number;
  content_hash: string;
  created_at: string;
};

type DbChannel = {
  id: string;
  model_line_id: string;
  name: ChannelName;
  current_version_id: string | null;
  updated_at: string;
  updated_by: string | null;
};

const emptySnapshot = (quotaMb: number): RegistrySnapshot => ({
  channels: [],
  runs: [],
  versions: [],
  storage: [],
  quotaMb,
});

function fmt(ts: string | null): string {
  if (!ts) return "";
  return ts.replace("T", " ").slice(0, 16);
}

function configFromRun(run: DbRun): TrainConfig {
  const cfg = run.config_yaml ?? {};
  const hp: HyperParameters = {
    epochs: cfg.hyperparameters?.epochs ?? 0,
    imgsz: cfg.hyperparameters?.imgsz ?? 0,
    batch: cfg.hyperparameters?.batch ?? "auto",
    patience: cfg.hyperparameters?.patience ?? 0,
    lr0: cfg.hyperparameters?.lr0 ?? 0,
    lrf: cfg.hyperparameters?.lrf ?? 0,
    mosaic: cfg.hyperparameters?.mosaic ?? 0,
    mixup: cfg.hyperparameters?.mixup ?? 0,
    copyPaste: cfg.hyperparameters?.copyPaste ?? cfg.hyperparameters?.copy_paste ?? 0,
  };
  return {
    modelLine: cfg.model_line ?? cfg.modelLine ?? "seeds-poc",
    dataset: cfg.dataset ?? "",
    sourceWeights: cfg.source_weights ?? cfg.sourceWeights ?? "",
    classes: cfg.classes ?? cfg.class_names ?? [],
    hyperParameters: hp,
    colabAccelerator: cfg.colab_accelerator ?? cfg.colabAccelerator ?? "T4",
  };
}

// Derive 0-100 progress from run_metrics. Default: use the latest reported
// "progress" metric if present; otherwise fall back to max(epoch)/total.
// See README for trade-offs — operators may want a different rule.
function deriveProgress(run: DbRun, metrics: DbRunMetric[]): number {
  if (run.status === "succeeded") return 100;
  const explicit = metrics.filter((m) => m.run_id === run.id && m.name === "progress");
  if (explicit.length > 0) {
    return Math.round(Math.max(...explicit.map((m) => m.value)));
  }
  const totalEpochs = run.config_yaml?.hyperparameters?.epochs ?? 0;
  if (totalEpochs > 0) {
    const epochs = metrics.filter((m) => m.run_id === run.id && m.epoch !== null).map((m) => m.epoch as number);
    if (epochs.length > 0) {
      return Math.round((Math.max(...epochs) / totalEpochs) * 100);
    }
  }
  return run.status === "running" ? 0 : 0;
}

function latestMetric(metrics: DbRunMetric[], runId: string, name: string): number | null {
  const filtered = metrics.filter((m) => m.run_id === runId && m.name === name);
  if (filtered.length === 0) return null;
  return filtered.sort((a, b) => b.step - a.step)[0].value;
}

function mapRun(run: DbRun, metrics: DbRunMetric[]): RegistryRun {
  const config = configFromRun(run);
  return {
    id: run.id,
    name: run.config_yaml?.name ?? run.id.slice(0, 8),
    status: run.status,
    modelLine: config.modelLine,
    dataset: config.dataset,
    hardware: typeof run.hardware === "string" ? run.hardware : run.hardware?.label ?? "",
    startedAt: fmt(run.started_at),
    finishedAt: run.finished_at ? fmt(run.finished_at) : null,
    progress: deriveProgress(run, metrics),
    map50: latestMetric(metrics, run.id, "mAP50") ?? latestMetric(metrics, run.id, "map50"),
    maskMap: latestMetric(metrics, run.id, "mask_mAP") ?? latestMetric(metrics, run.id, "mask_map"),
    config,
    colabNotebook: run.config_yaml?.colab_notebook ?? "",
    logs: (run.config_yaml?.logs ?? []) as string[],
  };
}

function mapVersion(v: DbVersion, channelByVersion: Map<string, ChannelName>): RegistryVersion {
  const md = v.metadata ?? {};
  const hp = md.hyperparameters ?? {};
  const channelName = channelByVersion.get(v.id);
  const state: VersionState = channelName ?? "inactive";
  return {
    id: v.id,
    semver: v.semver,
    runId: v.run_id ?? "",
    state,
    sourceWeights: md.source_weights ?? "",
    dataset: md.dataset ?? "",
    classes: md.class_names ?? [],
    hyperParameters: {
      epochs: hp.epochs ?? 0,
      imgsz: hp.imgsz ?? md.input_size ?? 0,
      batch: hp.batch ?? "auto",
      patience: hp.patience ?? 0,
      lr0: hp.lr0 ?? 0,
      lrf: hp.lrf ?? 0,
      mosaic: hp.mosaic ?? 0,
      mixup: hp.mixup ?? 0,
      copyPaste: hp.copy_paste ?? hp.copyPaste ?? 0,
    },
    map50: md.metrics?.map50 ?? 0,
    maskMap: md.metrics?.mask_map ?? 0,
    sizeMb: v.size_bytes / (1024 * 1024),
    contentHash: v.content_hash,
    compatSignature: v.compat_signature ?? "",
    createdAt: fmt(v.created_at),
  };
}

function mapChannel(c: DbChannel): RegistryChannel {
  return {
    name: c.name,
    versionId: c.current_version_id,
    updatedAt: fmt(c.updated_at),
    updatedBy: c.updated_by ?? "",
  };
}

function storageFromVersions(versions: DbVersion[], channels: DbChannel[]): StorageObject[] {
  const active = new Set(channels.map((c) => c.current_version_id).filter(Boolean) as string[]);
  const items: StorageObject[] = [];
  for (const v of versions) {
    items.push({
      id: `${v.id}-tflite`,
      versionId: v.id,
      key: v.tflite_r2_key,
      kind: "tflite",
      sizeMb: v.size_bytes / (1024 * 1024),
      active: active.has(v.id),
    });
    if (v.mlmodel_r2_key) {
      items.push({
        id: `${v.id}-coreml`,
        versionId: v.id,
        key: v.mlmodel_r2_key,
        kind: "coreml",
        sizeMb: v.size_bytes / (1024 * 1024),
        active: active.has(v.id),
      });
    }
  }
  return items;
}

export function createSupabaseStore(env: Env): RegistryStore {
  const client: SupabaseClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  let snapshot: RegistrySnapshot = emptySnapshot(env.quotaMb);
  let session: AuthSession | null = null;
  let modelLineId: string | null = null;
  let realtimeChannel: RealtimeChannel | null = null;
  const dataListeners = new Set<() => void>();
  const authListeners = new Set<() => void>();

  function notifyData() { dataListeners.forEach((fn) => fn()); }
  function notifyAuth() { authListeners.forEach((fn) => fn()); }

  async function resolveModelLine() {
    if (modelLineId) return modelLineId;
    const { data, error } = await client
      .from("model_lines")
      .select("id,slug,display_name")
      .eq("slug", env.modelLineSlug)
      .single<DbModelLine>();
    if (error) throw error;
    modelLineId = data.id;
    return modelLineId;
  }

  async function refresh() {
    const lineId = await resolveModelLine();
    const [{ data: runs, error: runErr }, { data: versions, error: vErr }, { data: channels, error: cErr }] = await Promise.all([
      client.from("runs").select("*").eq("model_line_id", lineId).order("started_at", { ascending: false }).limit(50),
      client.from("versions").select("*").eq("model_line_id", lineId).order("created_at", { ascending: false }).limit(100),
      client.from("channels").select("*").eq("model_line_id", lineId),
    ]);
    if (runErr) throw runErr;
    if (vErr) throw vErr;
    if (cErr) throw cErr;

    const runIds = (runs ?? []).map((r) => r.id);
    let metrics: DbRunMetric[] = [];
    if (runIds.length > 0) {
      const { data: metricRows, error: mErr } = await client
        .from("run_metrics")
        .select("run_id,step,epoch,name,value")
        .in("run_id", runIds);
      if (mErr) throw mErr;
      metrics = metricRows ?? [];
    }

    const channelByVersion = new Map<string, ChannelName>();
    for (const ch of channels ?? []) {
      if (ch.current_version_id) channelByVersion.set(ch.current_version_id, ch.name);
    }

    snapshot = {
      quotaMb: env.quotaMb,
      runs: (runs ?? []).map((r) => mapRun(r as DbRun, metrics)),
      versions: (versions ?? []).map((v) => mapVersion(v as DbVersion, channelByVersion)),
      channels: (channels ?? []).map((c) => mapChannel(c as DbChannel)),
      storage: storageFromVersions((versions ?? []) as DbVersion[], (channels ?? []) as DbChannel[]),
    };
    notifyData();
  }

  function setupRealtime() {
    if (realtimeChannel) {
      client.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    realtimeChannel = client
      .channel("registry-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "runs" }, () => { void refresh(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "run_metrics" }, () => { void refresh(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "channels" }, () => { void refresh(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "versions" }, () => { void refresh(); })
      .subscribe();
  }

  function applySession(supSession: any) {
    if (!supSession) {
      session = null;
    } else {
      const role = supSession.user?.app_metadata?.role;
      session = { email: supSession.user?.email ?? "", isAdmin: role === "admin" };
    }
    notifyAuth();
  }

  // Initial bootstrap.
  void (async () => {
    const { data } = await client.auth.getSession();
    applySession(data.session);
    try { await refresh(); } catch { /* ignore until env is configured */ }
    setupRealtime();
  })();

  client.auth.onAuthStateChange((_event, supSession) => {
    applySession(supSession);
    void refresh();
  });

  async function adminWrite<T>(fn: () => Promise<T>): Promise<T> {
    if (!session?.isAdmin) throw new Error("Admin role required.");
    return fn();
  }

  return {
    mode: "supabase",
    getSnapshot: () => snapshot,
    subscribe(listener) {
      dataListeners.add(listener);
      return () => dataListeners.delete(listener);
    },
    refresh,
    getSession: () => session,
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signOut() {
      await client.auth.signOut();
    },
    subscribeAuth(listener) {
      authListeners.add(listener);
      return () => authListeners.delete(listener);
    },
    async startTraining(config) {
      await adminWrite(async () => {
        const lineId = await resolveModelLine();
        const runName = `${config.dataset.split("/").pop()?.replace(".yaml", "") ?? "run"}`;
        const classPreview = config.classes.slice(0, 6).join(", ") + (config.classes.length > 6 ? "…" : "");
        const bootstrapLogs = [
          `Run queued by dashboard for model_line=${config.modelLine}`,
          `Runtime: Colab ${config.colabAccelerator}`,
          `Source weights: ${config.sourceWeights}`,
          `Dataset: ${config.dataset}`,
          `Classes (${config.classes.length}): ${classPreview}`,
          `Epochs=${config.hyperParameters.epochs} · imgsz=${config.hyperParameters.imgsz} · lr0=${config.hyperParameters.lr0}`,
          "Awaiting Python SDK / Colab MCP to stream run_metrics…",
        ];
        const { error } = await client.from("runs").insert({
          model_line_id: lineId,
          status: "running",
          config_yaml: {
            name: runName,
            model_line: config.modelLine,
            dataset: config.dataset,
            source_weights: config.sourceWeights,
            classes: config.classes,
            hyperparameters: config.hyperParameters,
            colab_accelerator: config.colabAccelerator,
            colab_notebook: `Colab MCP / ${runName}.ipynb (pending)`,
            logs: bootstrapLogs,
          },
          hardware: { label: `Colab ${config.colabAccelerator}` },
        });
        if (error) throw error;
        await refresh();
      });
    },
    async deployVersion(versionId, channel) {
      await adminWrite(async () => {
        const lineId = await resolveModelLine();
        const { error } = await client
          .from("channels")
          .update({ current_version_id: versionId, updated_by: session?.email ?? null })
          .eq("model_line_id", lineId)
          .eq("name", channel);
        if (error) throw error;
        await refresh();
      });
    },
    async undeployChannel(channel) {
      await adminWrite(async () => {
        const lineId = await resolveModelLine();
        const { error } = await client
          .from("channels")
          .update({ current_version_id: null, updated_by: session?.email ?? null })
          .eq("model_line_id", lineId)
          .eq("name", channel);
        if (error) throw error;
        await refresh();
      });
    },
    async deleteInactiveArtifact(storageId) {
      await adminWrite(async () => {
        const versionId = storageId.replace(/-(tflite|coreml)$/, "");
        const url = `${env.supabaseUrl}/functions/v1/storage-usage/delete`;
        const token = (await client.auth.getSession()).data.session?.access_token;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: token ? `Bearer ${token}` : "",
            apikey: env.supabaseAnonKey,
          },
          body: JSON.stringify({ version_id: versionId }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`storage-usage/delete failed: ${res.status} ${body}`);
        }
        await refresh();
      });
    },
  };
}
