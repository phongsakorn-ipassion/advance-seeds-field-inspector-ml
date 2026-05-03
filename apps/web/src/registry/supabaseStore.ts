import { createClient, RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { RegistryStore } from "./api";
import type {
  AuthSession,
  ChannelName,
  DatasetStats,
  HyperParameters,
  RegistryChannel,
  RegistryDeployment,
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

function datasetStatsFrom(value: any): DatasetStats | undefined {
  const source = value?.dataset_stats ?? value?.datasetStats;
  if (!source || typeof source !== "object") return undefined;
  return {
    total: numberOrUndefined(source.total),
    train: numberOrUndefined(source.train),
    validation: numberOrUndefined(source.validation ?? source.val),
    testing: numberOrUndefined(source.testing ?? source.test),
    trainPath: stringOrUndefined(source.train_path ?? source.trainPath),
    validationPath: stringOrUndefined(source.validation_path ?? source.validationPath ?? source.val_path ?? source.valPath),
    testingPath: stringOrUndefined(source.testing_path ?? source.testingPath ?? source.test_path ?? source.testPath),
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

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

type DbDeployment = {
  id: string;
  model_line_id: string;
  channel_name: ChannelName;
  version_id: string;
  status: "active" | "archived";
  is_default: boolean;
  deployed_at: string;
};

const emptySnapshot = (quotaMb: number): RegistrySnapshot => ({
  channels: [],
  deployments: [],
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
    datasetStats: datasetStatsFrom(cfg),
    sourceWeights: cfg.source_weights ?? cfg.sourceWeights ?? "",
    classes: cfg.classes ?? cfg.class_names ?? [],
    hyperParameters: hp,
    colabAccelerator: cfg.colab_accelerator ?? cfg.colabAccelerator ?? "T4",
    note: typeof cfg.note === "string" ? cfg.note : "",
  };
}

// Derive 0-100 progress from run_metrics. Default: use the latest reported
// "progress" metric if present; otherwise fall back to max(epoch)/total.
// See README for trade-offs — operators may want a different rule.
function deriveProgress(run: DbRun, metrics: DbRunMetric[]): number {
  if (run.status === "succeeded") return 100;
  const explicit = metrics.filter((m) => m.run_id === run.id && normalizeMetricName(m.name) === "progress");
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

function latestMetric(metrics: DbRunMetric[], runId: string, names: string[]): number | null {
  const allowed = new Set(names.map(normalizeMetricName));
  const filtered = metrics.filter((m) => m.run_id === runId && allowed.has(normalizeMetricName(m.name)));
  if (filtered.length === 0) return null;
  return filtered.sort((a, b) => b.step - a.step)[0].value;
}

function normalizeMetricName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

function mapRun(run: DbRun, metrics: DbRunMetric[]): RegistryRun {
  const config = configFromRun(run);
  return {
    id: run.id,
    name: run.config_yaml?.name ?? run.id.slice(0, 8),
    status: run.status,
    modelLine: config.modelLine,
    dataset: config.dataset,
    datasetStats: config.datasetStats,
    hardware: typeof run.hardware === "string" ? run.hardware : run.hardware?.label ?? "",
    startedAt: fmt(run.started_at),
    finishedAt: run.finished_at ? fmt(run.finished_at) : null,
    progress: deriveProgress(run, metrics),
    map50: latestMetric(metrics, run.id, ["mAP50", "map50", "metrics/mAP50(B)", "metrics/map50(b)"]),
    maskMap: latestMetric(metrics, run.id, ["mask_mAP", "mask_map", "metrics/mAP50-95(M)", "metrics/map50-95(m)"]),
    config,
    colabNotebook: run.config_yaml?.colab_notebook ?? "",
    logs: (run.config_yaml?.logs ?? []) as string[],
  };
}

function mapVersion(v: DbVersion, channelByVersion: Map<string, ChannelName>): RegistryVersion {
  const md = v.metadata ?? {};
  const hp = md.hyperparameters ?? {};
  const tfliteArtifact = md.artifacts?.tflite ?? {};
  const coremlArtifact = md.artifacts?.coreml ?? {};
  const channelName = channelByVersion.get(v.id);
  const isArchived = Boolean(md.archived_at ?? md.artifacts_deleted_at ?? md.artifacts_archived_at);
  const state: VersionState = isArchived ? "archived" : channelName ?? "inactive";
  return {
    id: v.id,
    semver: v.semver,
    runId: v.run_id ?? "",
    state,
    sourceWeights: md.source_weights ?? "",
    dataset: md.dataset ?? "",
    datasetStats: datasetStatsFrom(md),
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
    tfliteR2Key: v.tflite_r2_key,
    tflitePrecision: typeof tfliteArtifact.quantization?.precision === "string" ? tfliteArtifact.quantization.precision : null,
    coremlR2Key: v.mlmodel_r2_key,
    coremlSizeMb: typeof coremlArtifact.size_bytes === "number" ? coremlArtifact.size_bytes / (1024 * 1024) : null,
    coremlContentHash: typeof coremlArtifact.content_hash === "string" ? coremlArtifact.content_hash : null,
    coremlPrecision: typeof coremlArtifact.quantization?.precision === "string" ? coremlArtifact.quantization.precision : null,
    compatSignature: v.compat_signature ?? "",
    createdAt: fmt(v.created_at),
    description: typeof md.description === "string" ? md.description : "",
    originalSemver: typeof md.original_semver === "string" ? md.original_semver : v.semver,
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

function mapDeployment(d: DbDeployment): RegistryDeployment {
  return {
    id: d.id,
    channel: d.channel_name,
    versionId: d.version_id,
    isDefault: d.is_default,
    deployedAt: fmt(d.deployed_at),
  };
}

function storageFromVersions(versions: DbVersion[], channels: DbChannel[], deployments: DbDeployment[]): StorageObject[] {
  const active = new Set([
    ...channels.map((c) => c.current_version_id).filter(Boolean) as string[],
    ...deployments.filter((d) => d.status === "active").map((d) => d.version_id),
  ]);
  const items: StorageObject[] = [];
  for (const v of versions) {
    const md = v.metadata ?? {};
    if (md.archived_at || md.artifacts_deleted_at || md.artifacts_archived_at) continue;
    items.push({
      id: `${v.id}-tflite`,
      versionId: v.id,
      key: v.tflite_r2_key,
      kind: "tflite",
      sizeMb: v.size_bytes / (1024 * 1024),
      active: active.has(v.id),
    });
    if (v.mlmodel_r2_key) {
      const coremlSize = v.metadata?.artifacts?.coreml?.size_bytes;
      items.push({
        id: `${v.id}-coreml`,
        versionId: v.id,
        key: v.mlmodel_r2_key,
        kind: "coreml",
        sizeMb: (typeof coremlSize === "number" ? coremlSize : v.size_bytes) / (1024 * 1024),
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
    const [{ data: runs, error: runErr }, { data: versions, error: vErr }, { data: channels, error: cErr }, deploymentResult] = await Promise.all([
      client.from("runs").select("*").eq("model_line_id", lineId).order("started_at", { ascending: false }).limit(50),
      client.from("versions").select("*").eq("model_line_id", lineId).order("created_at", { ascending: false }).limit(100),
      client.from("channels").select("*").eq("model_line_id", lineId),
      client.from("channel_deployments").select("*").eq("model_line_id", lineId).eq("status", "active"),
    ]);
    if (runErr) throw runErr;
    if (vErr) throw vErr;
    if (cErr) throw cErr;
    const deployments = deploymentResult.error?.code === "42P01" ? [] : (deploymentResult.data ?? []);
    if (deploymentResult.error && deploymentResult.error.code !== "42P01") throw deploymentResult.error;

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
    for (const dep of deployments as DbDeployment[]) {
      if (!channelByVersion.has(dep.version_id)) channelByVersion.set(dep.version_id, dep.channel_name);
    }

    snapshot = {
      quotaMb: env.quotaMb,
      runs: (runs ?? []).map((r) => mapRun(r as DbRun, metrics)),
      versions: (versions ?? []).map((v) => mapVersion(v as DbVersion, channelByVersion)),
      channels: (channels ?? []).map((c) => mapChannel(c as DbChannel)),
      deployments: (deployments as DbDeployment[]).map(mapDeployment),
      storage: storageFromVersions((versions ?? []) as DbVersion[], (channels ?? []) as DbChannel[], deployments as DbDeployment[]),
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
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_deployments" }, () => { void refresh(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "versions" }, () => { void refresh(); })
      .subscribe();
  }

  function applySession(supSession: any) {
    if (!supSession) {
      session = null;
    } else {
      const role = supSession.user?.app_metadata?.role;
      session = { userId: supSession.user?.id, email: supSession.user?.email ?? "", isAdmin: role === "admin" };
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

  async function insertLocalRun(config: TrainConfig, lineId: string) {
    const base = `${config.dataset.split("/").pop()?.replace(".yaml", "") ?? "run"}`;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const runName = `${base}-${stamp}`;
    const classPreview = config.classes.slice(0, 6).join(", ") + (config.classes.length > 6 ? "..." : "");
    const bootstrapLogs = [
      `Run queued by dashboard for model_line=${config.modelLine}`,
      `Runtime: Colab ${config.colabAccelerator}`,
      `Source weights: ${config.sourceWeights}`,
      `Dataset: ${config.dataset}`,
      `Classes (${config.classes.length}): ${classPreview}`,
      `Epochs=${config.hyperParameters.epochs} | imgsz=${config.hyperParameters.imgsz} | lr0=${config.hyperParameters.lr0}`,
      "Hosted trigger is not configured. Awaiting Python SDK / Colab MCP to stream run_metrics...",
    ];
    const { error } = await client.from("runs").insert({
      model_line_id: lineId,
      status: "running",
      config_yaml: {
        name: runName,
        model_line: config.modelLine,
        dataset: config.dataset,
        dataset_stats: config.datasetStats,
        source_weights: config.sourceWeights,
        classes: config.classes,
        hyperparameters: config.hyperParameters,
        colab_accelerator: config.colabAccelerator,
        colab_notebook: `Colab MCP / ${runName}.ipynb (pending)`,
        note: config.note ?? "",
        logs: bootstrapLogs,
      },
      hardware: { label: `Colab ${config.colabAccelerator}` },
    });
    if (error) throw error;
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
    async deleteRun(runId) {
      await adminWrite(async () => {
        // run_metrics is ON DELETE CASCADE on runs(id), so deleting the run row
        // alone removes its metrics. Skip the explicit metrics delete to avoid
        // a separate failure mode if something blocks that table.
        const { error } = await client.from("runs").delete().eq("id", runId);
        if (error) {
          const detail = [error.message, error.code && `code=${error.code}`, error.details, error.hint]
            .filter(Boolean)
            .join(" · ");
          throw new Error(`Failed to delete run: ${detail || "unknown error"}`);
        }
        await refresh();
      });
    },
    async startTraining(config) {
      await adminWrite(async () => {
        const lineId = await resolveModelLine();
        const token = (await client.auth.getSession()).data.session?.access_token;
        const res = await fetch(`${env.supabaseUrl}/functions/v1/start-training`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: token ? `Bearer ${token}` : "",
            apikey: env.supabaseAnonKey,
          },
          body: JSON.stringify({
            model_line_slug: config.modelLine,
            config: {
              model_line: config.modelLine,
              dataset: config.dataset,
              dataset_stats: config.datasetStats,
              source_weights: config.sourceWeights,
              classes: config.classes,
              hyperparameters: config.hyperParameters,
              colab_accelerator: config.colabAccelerator,
              note: config.note ?? "",
            },
          }),
        });
        if (!res.ok) {
          let body: { error?: string } = {};
          try { body = await res.json(); } catch { /* use status text */ }
          if (res.status === 404 || res.status === 503 || body.error === "hosted_training_not_configured") {
            await insertLocalRun(config, lineId);
          } else {
            throw new Error(body.error ?? `start-training failed: ${res.status}`);
          }
        }
        await refresh();
      });
    },
    async deployVersion(versionId, channel, options) {
      await adminWrite(async () => {
        const version = snapshot.versions.find((v) => v.id === versionId);
        if (version?.state === "archived") {
          throw new Error("Archived models cannot be deployed.");
        }
        const lineId = await resolveModelLine();
        const { error: upsertErr } = await client
          .from("channel_deployments")
          .upsert({
            model_line_id: lineId,
            channel_name: channel,
            version_id: versionId,
            status: "active",
            is_default: false,
            deployed_by: session?.userId ?? null,
            archived_at: null,
            archived_by: null,
          }, { onConflict: "model_line_id,channel_name,version_id" });
        if (upsertErr) throw storeError(`Failed to add deployment to ${channel}`, upsertErr);
        if (options?.setDefault ?? true) {
          await setChannelDefault(lineId, channel, versionId);
        }
        await refresh();
      });
    },
    async undeployChannel(channel, versionId) {
      await adminWrite(async () => {
        const lineId = await resolveModelLine();
        const targetVersionId = versionId ?? snapshot.channels.find((ch) => ch.name === channel)?.versionId;
        if (!targetVersionId) return;
        const { error } = await client
          .from("channel_deployments")
          .update({
            status: "archived",
            is_default: false,
            archived_at: new Date().toISOString(),
            archived_by: session?.userId ?? null,
          })
          .eq("model_line_id", lineId)
          .eq("channel_name", channel)
          .eq("version_id", targetVersionId);
        if (error) throw storeError(`Failed to undeploy from ${channel}`, error);
        if (snapshot.channels.find((ch) => ch.name === channel)?.versionId === targetVersionId) {
          const replacement = snapshot.deployments.find((dep) =>
            dep.channel === channel && dep.versionId !== targetVersionId
          );
          await setChannelDefault(lineId, channel, replacement?.versionId ?? null);
        }
        await refresh();
      });
    },
    async uploadDataset(file, modelLineSlug) {
      return await adminWrite(async () => {
        const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
        const tokenRes = await client.auth.getSession();
        const token = tokenRes.data.session?.access_token;
        const presignRes = await fetch(`${env.supabaseUrl}/functions/v1/upload-dataset`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: token ? `Bearer ${token}` : "",
            apikey: env.supabaseAnonKey,
          },
          body: JSON.stringify({ filename: safeName, model_line_slug: modelLineSlug }),
        });
        if (!presignRes.ok) {
          throw new Error(`upload-dataset presign failed: ${presignRes.status} ${await presignRes.text()}`);
        }
        const { upload_url, r2_key } = await presignRes.json() as { upload_url: string; r2_key: string };
        const putRes = await fetch(upload_url, {
          method: "PUT",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) {
          throw new Error(`R2 PUT failed: ${putRes.status} ${await putRes.text()}`);
        }
        return { r2Key: r2_key };
      });
    },
    async renameVersion(versionId, semver) {
      const next = semver.trim();
      if (!next) throw new Error("Version name cannot be empty.");
      await adminWrite(async () => {
        const { data: row, error: readErr } = await client
          .from("versions")
          .select("semver, metadata")
          .eq("id", versionId)
          .single();
        if (readErr) throw readErr;
        const md = (row?.metadata ?? {}) as Record<string, unknown>;
        const updates: { semver: string; metadata?: Record<string, unknown> } = { semver: next };
        if (typeof md.original_semver !== "string" && row?.semver) {
          updates.metadata = { ...md, original_semver: row.semver };
        }
        const { error } = await client.from("versions").update(updates).eq("id", versionId);
        if (error) {
          if (error.code === "23505") throw new Error(`Version "${next}" already exists.`);
          throw error;
        }
        await refresh();
      });
    },
    async updateVersionDescription(versionId, description) {
      await adminWrite(async () => {
        const { data, error: readErr } = await client
          .from("versions")
          .select("metadata")
          .eq("id", versionId)
          .single();
        if (readErr) throw readErr;
        const md = (data?.metadata ?? {}) as Record<string, unknown>;
        const nextMd = { ...md, description };
        const { error } = await client.from("versions").update({ metadata: nextMd }).eq("id", versionId);
        if (error) throw error;
        await refresh();
      });
    },
    async deleteInactiveArtifact(storageId) {
      await adminWrite(async () => {
        const versionId = storageId.replace(/-(tflite|coreml)$/, "");
        await archiveVersionById(versionId);
        await refresh();
      });
    },
    async archiveVersion(versionId) {
      await adminWrite(async () => {
        await archiveVersionById(versionId, "archive");
        await refresh();
      });
    },
  };

  async function archiveVersionById(versionId: string, action: "delete" | "archive" = "delete"): Promise<void> {
    const url = `${env.supabaseUrl}/functions/v1/storage-usage/${action}`;
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
      throw new Error(`${action === "archive" ? "Archive" : "Delete"} failed: ${res.status} ${body}`);
    }
  }

  async function setChannelDefault(lineId: string, channel: ChannelName, versionId: string | null): Promise<void> {
    if (versionId) {
      const { error: clearErr } = await client
        .from("channel_deployments")
        .update({ is_default: false })
        .eq("model_line_id", lineId)
        .eq("channel_name", channel)
        .eq("status", "active");
      if (clearErr && clearErr.code !== "42P01") throw storeError(`Failed to reset ${channel} defaults`, clearErr);
      const { error: markErr } = await client
        .from("channel_deployments")
        .update({ is_default: true })
        .eq("model_line_id", lineId)
        .eq("channel_name", channel)
        .eq("version_id", versionId)
        .eq("status", "active");
      if (markErr && markErr.code !== "42P01") throw storeError(`Failed to set ${channel} default`, markErr);
    }
    const { error } = await client
      .from("channels")
      .update({ current_version_id: versionId, updated_by: session?.userId ?? null })
      .eq("model_line_id", lineId)
      .eq("name", channel);
    if (error) throw storeError(`Failed to set ${channel} default`, error);
  }
}

function storeError(prefix: string, error: { message?: string; code?: string; details?: string; hint?: string }): Error {
  const detail = [error.message, error.code && `code=${error.code}`, error.details, error.hint]
    .filter(Boolean)
    .join(" · ");
  return new Error(`${prefix}: ${detail || "unknown error"}`);
}
