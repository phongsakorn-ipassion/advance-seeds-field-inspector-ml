import { Fragment, FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  Archive,
  ArrowUpRight,
  Apple,
  Bell,
  Copy,
  Database,
  Download,
  ExternalLink,
  Info,
  LogOut,
  Notebook,
  Pencil,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sprout,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import {
  ChannelName,
  DatasetStats,
  defaultConfig,
  RegistryRun,
  RegistryStore,
  RegistryVersion,
  TrainConfig,
  createRegistryStore,
} from "./registry";

type Section = "overview" | "train" | "models" | "storage";
type TrainTab = "form" | "live" | "recent";
type VersionFilter = "all" | "staging" | "production" | "candidate" | "inactive" | "archived";
type VersionSort = "created" | "performance" | "map50" | "maskMap";
type ActivityTone = "info" | "success" | "danger" | "muted";
type ActivityNotification = {
  id: string;
  title: string;
  detail: string;
  tone: ActivityTone;
  time: string;
  section?: Section;
  runId?: string;
  toast?: boolean;
};

function Hint({ text }: { text: string }) {
  return (
    <span className="hint">
      <button type="button" className="hint-trigger" aria-label={text}>
        <Info size={13} aria-hidden="true" />
      </button>
      <span className="hint-bubble" role="tooltip">{text}</span>
    </span>
  );
}

function SectionMiniHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="section-mini-heading">
      <h3>{title}</h3>
      <Hint text={hint} />
    </div>
  );
}

function parseYoloClasses(yaml: string): string[] | null {
  // Supports either:
  //   names: [class_a, class_b, ...]
  //   names:
  //     - class_a
  //     - class_b
  //   names:
  //     0: class_a
  //     1: class_b
  const inline = yaml.match(/^\s*names\s*:\s*\[([^\]]*)\]/m);
  if (inline) {
    return inline[1].split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  }
  const block = yaml.match(/^\s*names\s*:\s*\n((?:\s+.+\n?)+)/m);
  if (block) {
    const lines = block[1].split("\n").map((l) => l.trim()).filter(Boolean);
    const dict = lines.map((line) => line.match(/^\d+\s*:\s*(.+)$/)).filter(Boolean) as RegExpMatchArray[];
    if (dict.length === lines.length && dict.length > 0) {
      return dict.map((m) => m[1].trim().replace(/^['"]|['"]$/g, ""));
    }
    const list = lines.map((line) => line.match(/^-\s*(.+)$/)).filter(Boolean) as RegExpMatchArray[];
    if (list.length === lines.length && list.length > 0) {
      return list.map((m) => m[1].trim().replace(/^['"]|['"]$/g, ""));
    }
  }
  return null;
}

function parseYoloDatasetStats(yaml: string): DatasetStats | undefined {
  const trainPath = parseYamlStringValue(yaml, "train");
  const validationPath = parseYamlStringValue(yaml, "val") ?? parseYamlStringValue(yaml, "validation");
  const testingPath = parseYamlStringValue(yaml, "test") ?? parseYamlStringValue(yaml, "testing");
  if (!trainPath && !validationPath && !testingPath) return undefined;
  return { trainPath, validationPath, testingPath };
}

function parseYamlStringValue(yaml: string, key: string): string | undefined {
  const match = yaml.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+)\\s*$`, "m"));
  if (!match) return undefined;
  const raw = match[1].trim();
  if (!raw || raw.startsWith("[") || raw.startsWith("{")) return undefined;
  return raw.replace(/^['"]|['"]$/g, "");
}

function resolveDatasetStats(_dataset: string, stats?: DatasetStats): DatasetStats | undefined {
  return stats;
}

function sumKnownCounts(stats?: DatasetStats): number | undefined {
  if (!stats) return undefined;
  const known = [stats.train, stats.validation, stats.testing].filter((value): value is number => typeof value === "number");
  return known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : undefined;
}

function formatCount(value?: number): string {
  return typeof value === "number" ? value.toLocaleString() : "Pending";
}

// Display-only status that promotes a stuck "running" run (no progress, no
// metrics yet) into "waiting" — i.e. the dashboard inserted the row but no
// trainer has started reporting back. Used purely for status pill rendering.
type DisplayStatus = "queued" | "waiting" | "running" | "succeeded" | "failed" | "cancelled";
function displayRunStatus(run: RegistryRun): DisplayStatus {
  if (run.status === "running" && run.progress === 0 && run.map50 === null && run.maskMap === null) {
    return "waiting";
  }
  return run.status;
}

function compareVersions(a: RegistryVersion, b: RegistryVersion, sort: VersionSort): number {
  if (sort === "performance") {
    return ((b.map50 + b.maskMap) / 2) - ((a.map50 + a.maskMap) / 2);
  }
  if (sort === "map50") return b.map50 - a.map50;
  if (sort === "maskMap") return b.maskMap - a.maskMap;
  return Date.parse(b.createdAt.replace(" ", "T")) - Date.parse(a.createdAt.replace(" ", "T"));
}

function expertLogLines(run: RegistryRun): string[] {
  const stats = resolveDatasetStats(run.dataset, run.datasetStats ?? run.config.datasetStats);
  const map50 = run.map50 === null ? "pending" : run.map50.toFixed(3);
  const maskMap = run.maskMap === null ? "pending" : run.maskMap.toFixed(3);
  return [
    `[registry] run=${run.id} status=${run.status} progress=${run.progress}% hardware="${run.hardware || "pending"}"`,
    `[dataset] config=${run.dataset || "pending"} total=${formatCount(stats?.total)} train=${formatCount(stats?.train)} val=${formatCount(stats?.validation)} test=${formatCount(stats?.testing)}`,
    `[training] epochs=${run.config.hyperParameters.epochs} imgsz=${run.config.hyperParameters.imgsz} batch=${run.config.hyperParameters.batch} patience=${run.config.hyperParameters.patience}`,
    `[augmentation] mosaic=${run.config.hyperParameters.mosaic} mixup=${run.config.hyperParameters.mixup} copyPaste=${run.config.hyperParameters.copyPaste}`,
    `[metrics] mAP50=${map50} mask_mAP=${maskMap} source_weights=${run.config.sourceWeights || "pending"}`,
    `[timing] started_at="${run.startedAt || "pending"}" finished_at="${run.finishedAt ?? "running"}" notebook="${run.colabNotebook || "pending"}"`,
    ...run.logs.map((line, index) => `[log ${String(index + 1).padStart(2, "0")}] ${line}`),
  ];
}

function functionsBaseUrl(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1` : "/functions/v1";
}

function listModelsEndpoint(channel: ChannelName, platform: "android" | "ios"): string {
  return `${functionsBaseUrl()}/list-deployed-models?model_line=seeds-poc&channel=${channel}&platform=${platform}`;
}

function resolveChannelEndpoint(channel: ChannelName, platform: "android" | "ios"): string {
  return `${functionsBaseUrl()}/resolve-channel?model_line=seeds-poc&channel=${channel}&platform=${platform}&current_version={version_id}&current_compat={compat_signature}`;
}

function deriveActivityNotifications(snapshot: ReturnType<RegistryStore["getSnapshot"]>): ActivityNotification[] {
  const items: ActivityNotification[] = [];
  for (const run of snapshot.runs) {
    const status = displayRunStatus(run);
    const latestLog = run.logs.length > 0 ? run.logs[run.logs.length - 1] : undefined;
    const progressBucket = status === "running" ? Math.floor(run.progress / 10) * 10 : run.progress;
    items.push({
      id: `run:${run.id}:${status}:${progressBucket}`,
      title: status === "succeeded" ? "Training finished" : status === "failed" ? "Training failed" : status === "waiting" ? "Training waiting" : "Training running",
      detail: latestLog ? `${run.name} · ${latestLog}` : `${run.name} · ${run.progress}%`,
      tone: status === "succeeded" ? "success" : status === "failed" ? "danger" : status === "waiting" ? "muted" : "info",
      time: run.finishedAt ?? run.startedAt,
      section: "train",
      runId: run.id,
      toast: status === "succeeded" || status === "failed",
    });
  }
  for (const version of snapshot.versions) {
    items.push({
      id: `version:${version.id}:${version.state}`,
      title: version.state === "archived" ? "Model archived" : "Model version ready",
      detail: `${version.semver} · ${pct(version.map50)} mAP50 · ${pct(version.maskMap)} mask`,
      tone: version.state === "archived" ? "muted" : "success",
      time: version.createdAt,
      section: "models",
      toast: true,
    });
  }
  for (const deployment of snapshot.deployments) {
    const version = snapshot.versions.find((candidate) => candidate.id === deployment.versionId);
    items.push({
      id: `deployment:${deployment.channel}:${deployment.versionId}:${deployment.isDefault ? "default" : "selectable"}`,
      title: deployment.isDefault ? `Default ${deployment.channel} model changed` : `Model deployed to ${deployment.channel}`,
      detail: `${version?.semver ?? deployment.versionId} is ${deployment.isDefault ? "default" : "selectable"}`,
      tone: "info",
      time: deployment.deployedAt,
      section: "models",
      toast: deployment.isDefault,
    });
  }
  for (const channel of snapshot.channels) {
    if (!channel.versionId) {
      items.push({
        id: `channel:${channel.name}:undeployed:${channel.updatedAt}`,
        title: `${channel.name} undeployed`,
        detail: `No default model is assigned to ${channel.name}`,
        tone: "muted",
        time: channel.updatedAt,
        section: "models",
        toast: true,
      });
    }
  }
  for (const item of snapshot.storage) {
    if (!item.active) {
      const version = snapshot.versions.find((candidate) => candidate.id === item.versionId);
      items.push({
        id: `storage:${item.id}:inactive`,
        title: "Inactive model storage",
        detail: `${item.key} · ${item.sizeMb.toFixed(1)} MB`,
        tone: "muted",
        time: version?.createdAt ?? "",
        section: "storage",
      });
    }
  }
  return items
    .filter((item) => item.time !== "")
    .sort((a, b) => Date.parse(b.time.replace(" ", "T")) - Date.parse(a.time.replace(" ", "T")))
    .slice(0, 24);
}

function notificationReadStorageKey(session: { email: string } | null): string | null {
  if (!session) return null;
  return `advance-seeds:model-registry:read-activity:${store.mode}:${session.email}`;
}

function loadStoredReadActivityIds(key: string): Set<string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((value): value is string => typeof value === "string")) : null;
  } catch {
    return null;
  }
}

function persistReadActivityIds(key: string | null, ids: Set<string>) {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids].slice(-200)));
  } catch {
    // Ignore quota/privacy-mode failures; notifications still work in memory.
  }
}

function DatasetConfigField({
  value,
  onChange,
  modelLineSlug,
  disabled,
  onDatasetParsed,
}: {
  value: string;
  onChange: (next: string) => void;
  modelLineSlug: string;
  disabled?: boolean;
  onDatasetParsed?: (parsed: { dataset?: string; classes?: string[]; stats?: DatasetStats }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState<{ name: string; size: number; classes: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickFile() {
    if (disabled || busy) return;
    setError(null);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".yaml,.yml,application/yaml,text/yaml,text/x-yaml";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      try {
        const text = await file.text();
        const classes = parseYoloClasses(text);
        const stats = parseYoloDatasetStats(text);
        const { r2Key } = await store.uploadDataset(file, modelLineSlug || "seeds-poc");
        onChange(r2Key);
        if (onDatasetParsed) onDatasetParsed({ dataset: r2Key, classes: classes ?? undefined, stats });
        setUploaded({ name: file.name, size: file.size, classes: classes?.length ?? null });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setBusy(false);
      }
    };
    input.click();
  }

  return (
    <div className="dataset-field">
      <div className="dataset-row">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="configs/dataset.example.yaml or datasets/seeds-poc/.../file.yaml"
        />
        <button
          type="button"
          className="ghost-button compact"
          onClick={pickFile}
          disabled={disabled || busy}
          title={disabled ? "Admin role required" : "Upload a YOLO dataset YAML to R2"}
        >
          <Upload size={14} /> {busy ? "Uploading…" : "Upload .yaml"}
        </button>
      </div>
      {uploaded && !error && (
        <p className="dataset-note">
          Uploaded <code>{uploaded.name}</code> ({(uploaded.size / 1024).toFixed(1)} KB)
          {uploaded.classes !== null
            ? ` · parsed ${uploaded.classes} class${uploaded.classes === 1 ? "" : "es"} from names:`
            : " · could not parse names: block, classes left untouched"}
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

function TagInput({
  value,
  onChange,
  placeholder = "Add class…",
  numbered = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  numbered?: boolean;
}) {
  const [draft, setDraft] = useState("");

  // Accept "apple" or "0=apple" (or "0:apple"). The numeric prefix is dropped
  // because the index is positional in the array — it's display, not data.
  function parseToken(raw: string): string {
    const trimmed = raw.trim();
    const match = trimmed.match(/^\s*\d+\s*[=:]\s*(.+)$/);
    return (match ? match[1] : trimmed).trim();
  }

  function commit(raw: string) {
    const cleaned = parseToken(raw);
    if (!cleaned) return;
    if (value.includes(cleaned)) {
      setDraft("");
      return;
    }
    onChange([...value, cleaned]);
    setDraft("");
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === "," || event.key === "Tab") {
      if (draft.trim()) {
        event.preventDefault();
        commit(draft);
      }
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      event.preventDefault();
      remove(value.length - 1);
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text");
    if (/[,\n]/.test(pasted)) {
      event.preventDefault();
      const tokens = pasted.split(/[,\n]/).map((t) => parseToken(t)).filter(Boolean);
      const merged = Array.from(new Set([...value, ...tokens]));
      onChange(merged);
      setDraft("");
    }
  }

  return (
    <div className="tag-input">
      {value.map((tag, index) => (
        <span className="tag-chip" key={`${tag}-${index}`}>
          {numbered && <span className="tag-index">{index}</span>}
          <span>{tag}</span>
          <button
            type="button"
            className="tag-remove"
            aria-label={`Remove ${tag}`}
            onClick={() => remove(index)}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        className="tag-field"
        value={draft}
        placeholder={value.length === 0 ? placeholder : ""}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => draft.trim() && commit(draft)}
      />
    </div>
  );
}

const store = createRegistryStore();

function useStoreSnapshot(s: RegistryStore) {
  return useSyncExternalStore(
    (l) => s.subscribe(l),
    () => s.getSnapshot(),
    () => s.getSnapshot(),
  );
}

function useStoreSession(s: RegistryStore) {
  return useSyncExternalStore(
    (l) => s.subscribeAuth(l),
    () => s.getSession(),
    () => s.getSession(),
  );
}

export function App() {
  const snapshot = useStoreSnapshot(store);
  const session = useStoreSession(store);
  const [section, setSection] = useState<Section>("overview");
  const [trainTab, setTrainTab] = useState<TrainTab>("form");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [focusedRunId, setFocusedRunId] = useState<string | null>(null);
  const [loginError, setLoginError] = useState("");
  const [trainConfig, setTrainConfig] = useState<TrainConfig>(defaultConfig);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [readActivityIds, setReadActivityIds] = useState<Set<string>>(new Set());
  const [readStateHydrated, setReadStateHydrated] = useState(false);
  const [toasts, setToasts] = useState<ActivityNotification[]>([]);
  const knownActivityIds = useRef<Set<string> | null>(null);
  const hasStoredReadState = useRef(false);
  const activities = useMemo(() => deriveActivityNotifications(snapshot), [snapshot]);
  const readStorageKey = notificationReadStorageKey(session);
  const unreadCount = activities.filter((activity) => !readActivityIds.has(activity.id)).length;

  useEffect(() => {
    if (!readStorageKey) return;
    setReadStateHydrated(false);
    const stored = loadStoredReadActivityIds(readStorageKey);
    hasStoredReadState.current = stored !== null;
    knownActivityIds.current = null;
    setReadActivityIds(stored ?? new Set());
    setReadStateHydrated(true);
  }, [readStorageKey]);

  useEffect(() => {
    if (!readStateHydrated) return;
    const current = new Set(activities.map((activity) => activity.id));
    if (knownActivityIds.current === null) {
      knownActivityIds.current = current;
      if (!hasStoredReadState.current) {
        setReadActivityIds(current);
        persistReadActivityIds(readStorageKey, current);
      }
      return;
    }
    const next = activities
      .filter((activity) => activity.toast && !knownActivityIds.current?.has(activity.id) && !readActivityIds.has(activity.id))
      .slice(0, 3);
    knownActivityIds.current = current;
    if (next.length === 0) return;
    setToasts((existing) => [...next, ...existing].slice(0, 3));
  }, [activities, readActivityIds, readStateHydrated, readStorageKey]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = window.setTimeout(() => {
      setToasts((existing) => existing.slice(0, -1));
    }, 5200);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  function openRun(runId: string) {
    setFocusedRunId(runId);
    setSection("train");
    const run = snapshot.runs.find((r) => r.id === runId);
    setTrainTab(run?.status === "running" ? "live" : "recent");
  }

  function openModelVersion(versionId: string) {
    setSelectedVersionId(versionId);
    setSection("models");
  }

  // Manual sub-nav clicks clear the focused run so the detail panel
  // doesn't bleed across Live tracking ↔ Recent runs.
  function changeTrainTab(next: TrainTab) {
    setTrainTab(next);
    setFocusedRunId(null);
  }

  function updateReadActivityIds(updater: (current: Set<string>) => Set<string>) {
    setReadActivityIds((current) => {
      const next = updater(current);
      persistReadActivityIds(readStorageKey, next);
      hasStoredReadState.current = true;
      return next;
    });
  }

  useEffect(() => {
    if (!selectedVersionId && snapshot.versions[0]) setSelectedVersionId(snapshot.versions[0].id);
  }, [snapshot.versions, selectedVersionId]);

  const selectedVersion = snapshot.versions.find((v) => v.id === selectedVersionId) ?? snapshot.versions[0];
  const storageUsed = snapshot.storage.reduce((sum, item) => sum + item.sizeMb, 0);
  const storagePercent = snapshot.quotaMb > 0 ? Math.round((storageUsed / snapshot.quotaMb) * 100) : 0;
  const storageOverQuota = storageUsed > snapshot.quotaMb;
  const production = resolveChannel(snapshot.channels, snapshot.versions, "production");
  const staging = resolveChannel(snapshot.channels, snapshot.versions, "staging");
  const isAdmin = !!session?.isAdmin;

  if (!session) {
    return (
      <LoginScreen
        mode={store.mode}
        onLogin={async (email, password) => {
          try {
            await store.signIn(email, password);
            setLoginError("");
          } catch (err) {
            setLoginError(err instanceof Error ? err.message : "Login failed.");
          }
        }}
        error={loginError}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="app-topbar" aria-label="Model registry navigation">
        <div className="topbar-inner">
          <div className="brand">
            <Sprout size={20} className="brand-icon" aria-hidden="true" />
            <div>
              <strong>Advance Seeds</strong>
              <span>Model Registry</span>
            </div>
          </div>
          <nav className="topbar-nav">
            <button className={section === "overview" ? "active" : ""} onClick={() => setSection("overview")} type="button">Overview</button>
            <button className={section === "train" ? "active" : ""} onClick={() => setSection("train")} type="button">Train</button>
            <button className={section === "models" ? "active" : ""} onClick={() => setSection("models")} type="button">Models</button>
            <button className={section === "storage" ? "active" : ""} onClick={() => setSection("storage")} type="button">Storage</button>
          </nav>
          <span className="topbar-spacer" />
          <NotificationCenter
            activities={activities}
            readActivityIds={readActivityIds}
            unreadCount={unreadCount}
            open={notificationsOpen}
            onToggle={() => setNotificationsOpen(!notificationsOpen)}
            onMarkAllRead={() => updateReadActivityIds(() => new Set(activities.map((activity) => activity.id)))}
            onOpenActivity={(activity) => {
              setNotificationsOpen(false);
              updateReadActivityIds((current) => new Set(current).add(activity.id));
              if (activity.runId) openRun(activity.runId);
              else if (activity.section) setSection(activity.section);
            }}
          />
          <div className="topbar-account-card" aria-label="Signed-in account">
            <span className="topbar-user">
              <ShieldCheck size={14} aria-hidden="true" />
              <span className="topbar-user-copy">
                <strong>{session.email}</strong>
                <small>{isAdmin ? "admin" : "read-only"}</small>
              </span>
            </span>
            <button className="account-signout-button" type="button" onClick={() => void store.signOut()} aria-label="Sign out">
              <LogOut size={14} aria-hidden="true" /> <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="workspace">
        <header className="page-header">
          <div>
            <h1>{sectionTitle(section)}</h1>
            <p>{sectionDescription(section)}</p>
          </div>
        </header>

        {section === "overview" && (
          <Overview
            production={production}
            staging={staging}
            runs={snapshot.runs}
            storageUsed={storageUsed}
            quota={snapshot.quotaMb}
            storagePercent={storagePercent}
            storageOverQuota={storageOverQuota}
            onOpenTrain={() => setSection("train")}
            onOpenRun={openRun}
          />
        )}

        {section === "train" && (
          <TrainWorkflow
            config={trainConfig}
            setConfig={setTrainConfig}
            runs={snapshot.runs}
            isAdmin={isAdmin}
            focusedRunId={focusedRunId}
            setFocusedRunId={setFocusedRunId}
            tab={trainTab}
            setTab={changeTrainTab}
            versions={snapshot.versions}
            onOpenModelVersion={openModelVersion}
            onStart={async () => {
              await store.startTraining(trainConfig);
              setTrainConfig(defaultConfig);
            }}
          />
        )}

        {section === "models" && (
          <ModelsWorkflow
            channels={snapshot.channels}
            deployments={snapshot.deployments}
            versions={snapshot.versions}
            runs={snapshot.runs}
            selectedVersion={selectedVersion}
            selectedVersionId={selectedVersionId}
            setSelectedVersionId={setSelectedVersionId}
            isAdmin={isAdmin}
          />
        )}

        {section === "storage" && (
          <StorageWorkflow
            quotaMb={snapshot.quotaMb}
            storage={snapshot.storage}
            versions={snapshot.versions}
            storageUsed={storageUsed}
            storagePercent={storagePercent}
            storageOverQuota={storageOverQuota}
            isAdmin={isAdmin}
          />
        )}
      </main>
      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((existing) => existing.filter((toast) => toast.id !== id))}
        onOpen={(toast) => {
          setToasts((existing) => existing.filter((item) => item.id !== toast.id));
          if (toast.runId) openRun(toast.runId);
          else if (toast.section) setSection(toast.section);
        }}
      />
    </div>
  );
}

function NotificationCenter({
  activities,
  readActivityIds,
  unreadCount,
  open,
  onToggle,
  onMarkAllRead,
  onOpenActivity,
}: {
  activities: ActivityNotification[];
  readActivityIds: Set<string>;
  unreadCount: number;
  open: boolean;
  onToggle: () => void;
  onMarkAllRead: () => void;
  onOpenActivity: (activity: ActivityNotification) => void;
}) {
  return (
    <div className="notification-center">
      <button
        className={open ? "notification-button active" : "notification-button"}
        type="button"
        aria-label={`Activity notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <Bell size={15} aria-hidden="true" />
        <span>{unreadCount > 99 ? "99+" : unreadCount}</span>
      </button>
      {open && (
        <div className="notification-popover" role="dialog" aria-label="Activity notifications">
          <header>
            <div>
              <strong>Activity</strong>
              <small>{activities.length === 0 ? "No activity yet" : `${unreadCount} unread · ${activities.length} recent events`}</small>
            </div>
            <button
              type="button"
              className="notification-mark-read"
              onClick={onMarkAllRead}
              disabled={unreadCount === 0}
            >
              Mark all read
            </button>
          </header>
          <div className="notification-list">
            {activities.length === 0 ? (
              <p>No registry activity has been recorded yet.</p>
            ) : activities.map((activity) => {
              const isRead = readActivityIds.has(activity.id);
              return (
                <article className={isRead ? "notification-item read" : "notification-item unread"} key={activity.id}>
                  <button type="button" className="notification-open" onClick={() => onOpenActivity(activity)}>
                    <span className={`notification-dot ${activity.tone}`} aria-hidden="true" />
                    <span>
                      <strong>{activity.title}</strong>
                      <small>{activity.detail}</small>
                    </span>
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ToastStack({
  toasts,
  onDismiss,
  onOpen,
}: {
  toasts: ActivityNotification[];
  onDismiss: (id: string) => void;
  onOpen: (toast: ActivityNotification) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite" aria-label="New activity notifications">
      {toasts.map((toast) => (
        <article className={`activity-toast ${toast.tone}`} key={toast.id}>
          <button type="button" className="activity-toast-body" onClick={() => onOpen(toast)}>
            <strong>{toast.title}</strong>
            <span>{toast.detail}</span>
          </button>
          <button type="button" className="activity-toast-close" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
            <X size={14} aria-hidden="true" />
          </button>
        </article>
      ))}
    </div>
  );
}

const adminPreset = {
  demo: { email: "admin@advance-seeds.demo", password: "demo-admin" },
  supabase: { email: "alex@advanceseeds.com", password: "DemoSeeds2026!" },
} as const;

function LoginScreen({
  mode,
  onLogin,
  error,
}: {
  mode: RegistryStore["mode"];
  onLogin: (email: string, password: string) => void;
  error: string;
}) {
  const preset = adminPreset[mode];
  const [showManual, setShowManual] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const visibleError = showManual ? error : "";

  async function signInAs(e: string, p: string) {
    setBusy(true);
    try {
      await onLogin(e, p);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="login-panel">
        <div className="brand large">
          <Sprout size={22} className="brand-icon" aria-hidden="true" />
          <div>
            <strong>Advance Seeds</strong>
            <span>Model Registry</span>
          </div>
        </div>
        <div>
          <h1>Admin console</h1>
          <p>One-click sign-in as the pre-created admin. Grants deploy, undeploy, train, and storage cleanup.</p>
        </div>
        <button
          className="admin-card"
          type="button"
          disabled={busy}
          onClick={() => void signInAs(preset.email, preset.password)}
        >
          <ShieldCheck size={20} />
          <div>
            <strong>Sign in as Admin</strong>
            <span>{preset.email}</span>
          </div>
        </button>
        {!showManual ? (
          <button className="ghost-button compact" type="button" onClick={() => setShowManual(true)}>
            Use a different account
          </button>
        ) : (
          <form
            className="manual-login"
            onSubmit={(event) => {
              event.preventDefault();
              if (!email || !password) return;
              void signInAs(email, password);
            }}
          >
            <label>
              <span className="label-text">Email</span>
              <input
                type="email"
                placeholder="you@advanceseeds.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </label>
            <label>
              <span className="label-text">Password</span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            {visibleError && <p className="form-error">{visibleError}</p>}
            <div className="button-row">
              <button className="primary-button" type="submit" disabled={busy || !email || !password}>
                Sign in
              </button>
              <button className="ghost-button" type="button" onClick={() => setShowManual(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function Overview({
  production,
  staging,
  runs,
  storageUsed,
  quota,
  storagePercent,
  storageOverQuota,
  onOpenTrain,
  onOpenRun,
}: {
  production?: RegistryVersion;
  staging?: RegistryVersion;
  runs: RegistryRun[];
  storageUsed: number;
  quota: number;
  storagePercent: number;
  storageOverQuota: boolean;
  onOpenTrain: () => void;
  onOpenRun: (runId: string) => void;
}) {
  const running = runs.find((run) => run.status === "running");
  return (
    <>
      <section className="summary-grid">
        <MetricCard label="Production" value={production?.semver ?? "Undeployed"} detail={production ? `${pct(production.maskMap)} mask mAP` : "No live model"} />
        <MetricCard label="Staging" value={staging?.semver ?? "Unset"} detail={staging ? `${pct(staging.map50)} mAP50` : "Ready for candidate"} />
        <MetricCard label="Training" value={running?.name ?? "Idle"} detail={running ? `${running.progress}% via ${running.hardware}` : "Manual Colab hand-off ready"} />
        <MetricCard label="R2 storage" value={`${storageUsed.toFixed(1)} / ${quota} MB`} detail={storageOverQuota ? "Over quota" : `${storagePercent}% used`} danger={storageOverQuota} />
      </section>
      <section className="content-grid">
        <section className="panel">
          <SectionHeading title="Operator journey" text="One path from training config to deployment." />
          <div className="journey-list">
            <Step icon={<Wand2 size={18} />} title="Train" text="Define classes and hyperparameters, then open the Colab notebook and run it manually." />
            <Step icon={<Activity size={18} />} title="Track" text="Watch progress, logs, and metrics update while the job runs." />
            <Step icon={<Rocket size={18} />} title="Deploy" text="Promote a validated model to staging or production." />
            <Step icon={<Trash2 size={18} />} title="Clean" text="Watch R2 usage and delete inactive artifacts before quota is exceeded." />
          </div>
          <button className="primary-button" type="button" onClick={onOpenTrain}>
            <Wand2 size={18} /> Start training
          </button>
        </section>
        <section className="panel">
          <SectionHeading title="Live runs" text="Reported by the Python SDK; click any run to open its full detail in the Train pipeline." />
          <RunList runs={runs.filter((r) => r.status === "running").slice(0, 4)} onSelect={onOpenRun} />
        </section>
      </section>
    </>
  );
}

function TrainWorkflow({
  config,
  setConfig,
  runs,
  isAdmin,
  focusedRunId,
  setFocusedRunId,
  tab,
  setTab,
  versions,
  onOpenModelVersion,
  onStart,
}: {
  config: TrainConfig;
  setConfig: (config: TrainConfig) => void;
  runs: RegistryRun[];
  isAdmin: boolean;
  focusedRunId: string | null;
  setFocusedRunId: (id: string | null) => void;
  tab: TrainTab;
  setTab: (tab: TrainTab) => void;
  versions: RegistryVersion[];
  onOpenModelVersion: (versionId: string) => void;
  onStart: () => Promise<void>;
}) {
  const runningRuns = runs.filter((r) => r.status === "running");
  const focused = focusedRunId ? runs.find((r) => r.id === focusedRunId) : undefined;
  const recent = runs.filter((r) => r.status !== "running").slice(0, 6);
  const versionByRunId = useMemo(() => new Map(versions.map((version) => [version.runId, version])), [versions]);
  const isFocusedRunning = focused?.status === "running";
  const showColabHandoff = focused ? focused.status !== "succeeded" && focused.status !== "failed" : false;
  const [howOpen, setHowOpen] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RegistryRun | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await store.deleteRun(pendingDelete.id);
      if (focusedRunId === pendingDelete.id) setFocusedRunId(null);
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : JSON.stringify(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  const detailPanel = (
    <section className={`panel run-detail-panel ${focused ? "open" : "closed"}`} aria-live="polite">
      {focused && (
        <>
          <div className="run-detail-header">
            <SectionHeading
              title={`Run · ${focused.name}`}
              text={`${focused.id} · ${focused.hardware}${focused.colabNotebook ? ` · ${focused.colabNotebook}` : ""}`}
            />
            <div className="run-detail-actions">
              {showColabHandoff && (
                <a
                  className="primary-button compact"
                  href={colabUrl(focused.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Colab does NOT auto-run the notebook. Once it opens, click Runtime, then Run all (Cmd/Ctrl+F9). The notebook will prompt for a Supabase service-role key and start training."
                  aria-label="Open in Colab. Colab does NOT auto-run the notebook. Once it opens, click Runtime, then Run all. The notebook will prompt for a Supabase service-role key and start training."
                >
                  <Notebook size={14} /> Open in Colab <ExternalLink size={12} />
                </a>
              )}
              <button type="button" className="ghost-button compact" onClick={() => setFocusedRunId(null)} aria-label="Close run detail">
                <X size={14} /> Close
              </button>
            </div>
          </div>
          {showColabHandoff && <ColabManualSteps runId={focused.id} />}
          {isFocusedRunning && focused.map50 === null && (
            <div className="track-hint">
              <Info size={14} aria-hidden="true" />
              <span>
                Waiting for Colab or a hosted worker to write <code>run_metrics</code>.
                If you have not clicked <em>Runtime, Run all</em> in Colab yet, this
                run will remain at the bootstrap log.
              </span>
            </div>
          )}
          <RunDetail run={focused} />
        </>
      )}
    </section>
  );

  return (
    <section className="train-layout-2">
    <aside className="sub-nav" aria-label="Train pipeline navigation">
      <button className={tab === "form" ? "active" : ""} onClick={() => setTab("form")} type="button">
        <Wand2 size={16} /> Train new model
      </button>
      <button className={tab === "live" ? "active" : ""} onClick={() => setTab("live")} type="button">
        <Activity size={16} /> Live tracking
        {runningRuns.length > 0 && <span className="sub-nav-badge">{runningRuns.length}</span>}
      </button>
      <button className={tab === "recent" ? "active" : ""} onClick={() => setTab("recent")} type="button">
        <Database size={16} /> Recent runs
      </button>
      <div className="sub-nav-spacer" />
      <button className="sub-nav-info" onClick={() => setHowOpen(true)} type="button">
        <Info size={14} /> How training runs
      </button>
    </aside>

    <div className="train-content">
    {tab === "form" && (
    <form
      className="panel train-form"
      onSubmit={async (event: FormEvent) => {
        event.preventDefault();
        if (!isAdmin) return;
        setStartError(null);
        try {
          await onStart();
          setTab("live");
        } catch (err) {
          setStartError(err instanceof Error ? err.message : String(err));
        }
      }}
    >
      <SectionHeading title="Train new model" text="Create the registry run here, then use the Run detail checklist to start Colab manually." />
        <label>
          <span className="label-text">
            Dataset config
            <Hint text="Reference to a YOLO dataset YAML. You can paste a path the trainer already has on disk, OR upload a .yaml file here so the trainer can pull it from R2. Image data is still expected to be reachable by the trainer; this only uploads the YAML." />
          </span>
          <DatasetConfigField
            value={config.dataset}
            onChange={(next) => setConfig({ ...config, dataset: next, datasetStats: undefined })}
            modelLineSlug={config.modelLine}
            disabled={!isAdmin}
            onDatasetParsed={({ dataset, classes, stats }) => setConfig({
              ...config,
              dataset: dataset ?? config.dataset,
              classes: classes ?? config.classes,
              datasetStats: stats,
            })}
          />
        </label>
        <label>
          <span className="label-text">
            Source weights
            <Hint text="Pretrained YOLO checkpoint to fine-tune. n is fastest and smallest, s is slightly larger but more accurate. Pick n for tight latency budgets, s when you have headroom." />
          </span>
          <select
            value={config.sourceWeights}
            onChange={(event) => setConfig({ ...config, sourceWeights: event.target.value })}
          >
            <option value="yolo26n-seg.pt">yolo26n-seg.pt — nano (fast, smallest)</option>
            <option value="yolo26s-seg.pt">yolo26s-seg.pt — small (more accurate)</option>
          </select>
        </label>
        <div className="readonly-field">
          <span className="label-text">
            Classes
            <Hint text="Read from the dataset YAML's names: block. Upload a different YAML to change them." />
          </span>
          <div className="readonly-classes">
            {config.classes.length === 0 ? (
              <span className="readonly-empty">No classes — upload a dataset YAML to populate.</span>
            ) : (
              config.classes.map((name, index) => (
                <span className="tag-chip readonly" key={`${name}-${index}`}>
                  <span className="tag-index">{index}</span>
                  <span>{name}</span>
                </span>
              ))
            )}
          </div>
        </div>
        <div className="form-grid">
          <NumberField label="Epochs" value={config.hyperParameters.epochs} onChange={(value) => updateHp(config, setConfig, "epochs", value)} hint="Number of full passes over the dataset. More epochs = more learning, but risk of overfitting. 50 is a sane default for fine-tuning." />
          <NumberField label="Image size" value={config.hyperParameters.imgsz} onChange={(value) => updateHp(config, setConfig, "imgsz", value)} hint="Input image side length in pixels. Larger = better small-object recall but slower training and inference. 640 is the YOLO default." />
          <NumberField label="Patience" value={config.hyperParameters.patience} onChange={(value) => updateHp(config, setConfig, "patience", value)} hint="Early-stopping patience: number of epochs with no improvement before the run stops. Set lower to fail fast on bad runs." />
          <NumberField label="LR0" value={config.hyperParameters.lr0} step="0.0001" onChange={(value) => updateHp(config, setConfig, "lr0", value)} hint="Initial learning rate. Lower = more stable but slower; higher = faster but may diverge. Start at 0.001 for fine-tuning, raise only if loss plateaus." />
          <NumberField label="Mosaic" value={config.hyperParameters.mosaic} step="0.1" onChange={(value) => updateHp(config, setConfig, "mosaic", value)} hint="Mosaic augmentation probability (0–1). Tiles four images into one for richer context. Helps small-object recall; turn down if memory is tight." />
          <NumberField label="Mixup" value={config.hyperParameters.mixup} step="0.1" onChange={(value) => updateHp(config, setConfig, "mixup", value)} hint="MixUp augmentation probability (0–1). Blends two images together. Adds regularization; usually low (0.0–0.2) for detection/segmentation." />
        </div>
        <details className="advanced-disclosure">
          <summary>Advanced hyperparameters</summary>
          <div className="form-grid">
            <label>
              <span className="label-text">
                Batch
                <Hint text="Batch size per training step. 'auto' lets YOLO pick based on GPU memory; otherwise pass an integer like 16 or 32. Larger batches train faster but need more VRAM." />
              </span>
              <select
                value={config.hyperParameters.batch}
                onChange={(event) => updateHp(config, setConfig, "batch", event.target.value)}
              >
                <option value="auto">auto</option>
                <option value="8">8</option>
                <option value="16">16</option>
                <option value="32">32</option>
                <option value="64">64</option>
              </select>
            </label>
            <NumberField
              label="LRF"
              value={config.hyperParameters.lrf}
              step="0.0001"
              onChange={(value) => updateHp(config, setConfig, "lrf", value)}
              hint="Final learning-rate factor. Final LR = LR0 × LRF. Smaller (e.g. 0.01) means more aggressive cosine annealing toward the end of training."
            />
            <NumberField
              label="Copy-paste"
              value={config.hyperParameters.copyPaste}
              step="0.1"
              onChange={(value) => updateHp(config, setConfig, "copyPaste", value)}
              hint="Copy-paste augmentation probability (0–1). Pastes instances from one image onto another to boost rare-class recall. Usually 0–0.3."
            />
          </div>
        </details>
        <label>
          <span className="label-text">
            Colab accelerator
            <Hint text="GPU class to select in Colab before Run all. T4 is free-tier and fine for YOLO-n. L4 is faster and worth it for longer runs. A100 is overkill for the PoC unless you're benchmarking." />
          </span>
          <select
            value={config.colabAccelerator}
            onChange={(event) => setConfig({ ...config, colabAccelerator: event.target.value as TrainConfig["colabAccelerator"] })}
          >
            <option value="T4">T4 — free tier</option>
            <option value="L4">L4 — faster, paid</option>
            <option value="A100">A100 — overkill, paid</option>
          </select>
        </label>
        <label>
          <span className="label-text">Note</span>
          <textarea
            value={config.note ?? ""}
            onChange={(event) => setConfig({ ...config, note: event.target.value })}
            placeholder="e.g. Expanded the spot-defect class with 200 new samples; testing if patience=12 is enough."
            rows={3}
            disabled={!isAdmin}
          />
        </label>
      <button className="primary-button" type="submit" disabled={!isAdmin} title={isAdmin ? "" : "Admin role required"}>
        <Rocket size={18} /> Create training run
      </button>
      {startError && <p className="form-error">{startError}</p>}
    </form>
    )}

    {tab === "live" && (
      <>
        <section className="panel">
          <SectionHeading
            title="Live tracking"
            text={
              runningRuns.length > 0
                ? "Click any row to open full detail below."
                : "Runs appear here while they are in progress."
            }
          />
          {runningRuns.length > 0 ? (
            <RunList
              runs={runningRuns}
              selectedId={focused?.id ?? null}
              onSelect={(id) => setFocusedRunId(id)}
              onDelete={(run) => setPendingDelete(run)}
            />
          ) : (
            <EmptyState
              icon={<Wand2 size={24} />}
              title="No runs in progress"
              text="Switch to Train new model to create a run, then open its Colab notebook."
            />
          )}
        </section>
        {detailPanel}
        {pendingDelete && (
          <Modal title="Delete waiting run" onClose={() => (deleteBusy ? undefined : (setPendingDelete(null), setDeleteError(null)))}>
            <p>
              Delete the waiting run <strong>{pendingDelete.name}</strong>? Training has not started yet,
              so no metrics will be lost. This removes the run row and any queued metric data.
            </p>
            {deleteError && <p className="form-error">{deleteError}</p>}
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => { setPendingDelete(null); setDeleteError(null); }} disabled={deleteBusy}>
                Cancel
              </button>
              <button type="button" className="danger-button" onClick={() => void confirmDelete()} disabled={deleteBusy}>
                {deleteBusy ? "Deleting…" : "Delete run"}
              </button>
            </div>
          </Modal>
        )}
      </>
    )}

    {tab === "recent" && (
      <>
        <section className="panel">
          <SectionHeading title="Recent training runs" text="History from this model line. Successful runs with model packages include a shortcut to Model detail." />
          {recent.length > 0 ? (
            <RunList
              runs={recent}
              selectedId={focused?.id ?? null}
              onSelect={(id) => setFocusedRunId(id)}
              versionByRunId={versionByRunId}
              onOpenModelVersion={onOpenModelVersion}
            />
          ) : (
            <EmptyState
              icon={<Activity size={24} />}
              title="No prior runs"
              text="Once a run completes it shows up here with final metrics and artifact context."
            />
          )}
        </section>
        {detailPanel}
      </>
    )}
    </div>
    {howOpen && (
      <Modal title="How training actually runs" onClose={() => setHowOpen(false)}>
        <p>
          This dashboard is currently optimized for a no-extra-cost manual Colab
          hand-off. Creating a training run writes the registry row, then the
          <strong> Open in Colab</strong> button opens the notebook with the run id
          already attached.
        </p>
        <p>
          In Colab, choose a GPU runtime, click <em>Runtime, Run all</em>, and paste
          the Supabase service-role key when the notebook asks for it. The key stays
          inside that Colab session; the browser still only uses the anon key.
        </p>
        <p>
          The run remains in Live tracking as waiting until Colab starts writing
          metrics. Once training begins, progress, logs, metrics, and the final
          model version stream back through Supabase Realtime.
        </p>
      </Modal>
    )}
    </section>
  );
}

function ColabManualSteps({ runId }: { runId: string }) {
  const [copied, setCopied] = useState(false);
  async function copyRunId() {
    try {
      await navigator.clipboard.writeText(runId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="manual-steps" aria-label="Manual Colab steps">
      <header className="manual-steps-header">
        <div className="manual-steps-title">
          <Notebook size={15} aria-hidden="true" />
          <span>Manual Colab hand-off</span>
        </div>
        <p>Create the run here, then let Colab do the GPU work. Keep this tab open so Realtime can show progress.</p>
      </header>
      <div className="manual-run-id">
        <span>Run ID</span>
        <code>{runId}</code>
        <button
          type="button"
          className="icon-action-button manual-run-copy"
          onClick={() => void copyRunId()}
          aria-label="Copy run id"
          title={copied ? "Copied" : "Copy run id"}
        >
          <Copy size={13} aria-hidden="true" />
        </button>
      </div>
      <ol className="manual-step-list">
        <li>
          <details>
            <summary><span>Open notebook and choose GPU</span></summary>
            <p>Click <em>Open in Colab</em>. The notebook URL already includes this run id.</p>
            <p>In Colab, set <em>Runtime, Change runtime type, GPU</em>. T4 is enough for YOLO-n; L4 or A100 is faster.</p>
          </details>
        </li>
        <li>
          <details>
            <summary><span>Run all notebook cells</span></summary>
            <p>Click <em>Runtime, Run all</em> or press <code>Cmd/Ctrl + F9</code>. Colab does not auto-run on open.</p>
          </details>
        </li>
        <li>
          <details>
            <summary><span>Authenticate the Colab session</span></summary>
            <p>Cell 7 asks for the Supabase service-role key. Paste it once; it stays inside that Colab session.</p>
          </details>
        </li>
        <li>
          <details>
            <summary><span>Confirm dataset image path</span></summary>
            <p>Cell 10 fetches the YAML from R2 and prints the resolved image path. If images are missing, mount Drive and unzip the dataset before the training cell.</p>
            <pre>{`from google.colab import drive\ndrive.mount('/content/drive')\n!unzip -q /content/drive/MyDrive/<your-dataset>.zip -d /content/advance-seeds-field-inspector-ml/data/processed/`}</pre>
          </details>
        </li>
        <li>
          <details>
            <summary><span>Start training</span></summary>
            <p>Cell 12 runs <code>scripts/train_for_run.py --run-id {runId.slice(0, 8)}...</code>. Per-epoch metrics stream back here.</p>
          </details>
        </li>
        <li>
          <details>
            <summary><span>Review exported artifacts</span></summary>
            <p>On success, the script exports INT8 TF Lite and optimized Core ML, uploads both to R2, and creates the model version.</p>
            <p>Closing the Colab tab terminates the runtime and stops training.</p>
          </details>
        </li>
      </ol>
    </div>
  );
}

function DatasetSplitScroller({ stats }: { stats?: DatasetStats }) {
  const splits = [
    { label: "Training", count: stats?.train, path: stats?.trainPath, role: "Model fitting" },
    { label: "Validation", count: stats?.validation, path: stats?.validationPath, role: "Early stopping and tuning" },
    { label: "Testing", count: stats?.testing, path: stats?.testingPath, role: "Final holdout check" },
  ];
  const total = stats?.total ?? sumKnownCounts(stats);
  const hasAnyPath = Boolean(stats?.trainPath || stats?.validationPath || stats?.testingPath);
  const hasAnyCount = typeof total === "number";
  const totalDisplay = hasAnyCount ? formatCount(total) : (hasAnyPath ? "—" : "No dataset");
  const knownTotal = typeof total === "number" && total > 0 ? total : null;
  return (
    <div className="dataset-split-scroller" aria-label="Dataset split summary">
      <div className="dataset-split-total">
        <div>
          <span>
            DATASET IMAGES
            <Hint text="Paths come from the YOLO YAML's train, val, and test fields. Image counts only appear once the trainer scans the dataset on disk — the browser can't count images in a remote folder." />
          </span>
          <small>{hasAnyCount ? "Trainer-scanned image inventory" : hasAnyPath ? "Waiting for trainer-side scan" : "No dataset paths available"}</small>
        </div>
        <strong>{totalDisplay}</strong>
      </div>
      {hasAnyPath && !hasAnyCount && (
        <p className="dataset-split-note">
          Paths parsed from YAML. Image counts will populate once the trainer scans the dataset.
        </p>
      )}
      <div className="dataset-split-rail" tabIndex={0}>
        {splits.map((split) => (
          <article className="dataset-split-card" key={split.label}>
            <div className="dataset-split-card-head">
              <span>{split.label}</span>
              <strong>{typeof split.count === "number" ? formatCount(split.count) : "—"}</strong>
            </div>
            <div className="dataset-split-meter" aria-hidden="true">
              <div style={{ width: `${knownTotal && typeof split.count === "number" ? Math.max(3, Math.round((split.count / knownTotal) * 100)) : 0}%` }} />
            </div>
            <small>{split.role}</small>
            <code title={split.path ?? "not in YAML"}>{split.path ?? "not in YAML"}</code>
          </article>
        ))}
      </div>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="ghost-button compact" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function ModelsWorkflow({
  channels,
  deployments,
  versions,
  runs,
  selectedVersion,
  selectedVersionId,
  setSelectedVersionId,
  isAdmin,
}: {
  channels: ReturnType<RegistryStore["getSnapshot"]>["channels"];
  deployments: ReturnType<RegistryStore["getSnapshot"]>["deployments"];
  versions: RegistryVersion[];
  runs: RegistryRun[];
  selectedVersion?: RegistryVersion;
  selectedVersionId: string;
  setSelectedVersionId: (id: string) => void;
  isAdmin: boolean;
}) {
  const [filter, setFilter] = useState<VersionFilter>("all");
  const [sort, setSort] = useState<VersionSort>("created");
  const visibleVersions = versions
    .filter((version) => filter === "all" || version.state === filter)
    .slice()
    .sort((a, b) => compareVersions(a, b, sort));

  useEffect(() => {
    if (visibleVersions.length > 0 && !visibleVersions.some((version) => version.id === selectedVersionId)) {
      setSelectedVersionId(visibleVersions[0].id);
    }
  }, [selectedVersionId, setSelectedVersionId, visibleVersions]);

  return (
    <section className="content-grid wide-right">
      <section className="panel">
        <SectionHeading title="Model versions" text="Select a model, then deploy or undeploy channels." />
        <div className="version-controls">
          <label>
            <span>Channel</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value as VersionFilter)}>
              <option value="all">All versions</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
              <option value="candidate">Candidates</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as VersionSort)}>
              <option value="created">Newest first</option>
              <option value="performance">Best combined performance</option>
              <option value="map50">Best mAP50</option>
              <option value="maskMap">Best mask mAP</option>
            </select>
          </label>
        </div>
        <div className="version-list">
          {visibleVersions.length === 0 && (
            <EmptyState
              icon={<Database size={24} />}
              title="No matching versions"
              text="Adjust channel or performance filters to see more model versions."
            />
          )}
          {visibleVersions.map((version) => (
            <button
              className={version.id === selectedVersionId ? "version-card selected" : "version-card"}
              key={version.id}
              type="button"
              onClick={() => setSelectedVersionId(version.id)}
            >
              <strong>{version.semver}</strong>
              <small>
                {pct(version.map50)} mAP50 / {pct(version.maskMap)} mask · {version.sizeMb.toFixed(1)} MB
              </small>
              <span className={`status-pill ${version.state}`}>{version.state}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="panel detail-panel">
        <SectionHeading title="Model detail" text="Metrics, classes, config, artifact, and deployment state." />
        {selectedVersion ? (
          <ModelDetail version={selectedVersion} channels={channels} deployments={deployments} runs={runs} isAdmin={isAdmin} />
        ) : (
          <EmptyState
            icon={<Database size={24} />}
            title="No model selected"
            text="Create or import a model version before reviewing lifecycle detail."
          />
        )}
      </section>
    </section>
  );
}

function StorageWorkflow({
  quotaMb,
  storage,
  versions,
  storageUsed,
  storagePercent,
  storageOverQuota,
  isAdmin,
}: {
  quotaMb: number;
  storage: ReturnType<RegistryStore["getSnapshot"]>["storage"];
  versions: RegistryVersion[];
  storageUsed: number;
  storagePercent: number;
  storageOverQuota: boolean;
  isAdmin: boolean;
}) {
  const [pendingDelete, setPendingDelete] = useState<null | { storageId: string; semver: string; key: string }>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await store.deleteInactiveArtifact(pendingDelete.storageId);
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <section className="panel">
      <SectionHeading title="R2 storage" text="Monitor artifact usage and delete inactive model records before storage exceeds quota." />
      {pendingDelete && (
        <Modal title="Delete model storage" onClose={() => (deleteBusy ? undefined : (setPendingDelete(null), setDeleteError(null)))}>
          <p>
            Delete the stored artifact for {pendingDelete.semver}. This permanently removes the model version and cannot be undone.
          </p>
          <p><code>{pendingDelete.key}</code></p>
          {deleteError && <p className="form-error">{deleteError}</p>}
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={() => setPendingDelete(null)} disabled={deleteBusy}>
              Cancel
            </button>
            <button type="button" className="danger-button" onClick={() => void confirmDelete()} disabled={deleteBusy}>
              {deleteBusy ? "Deleting…" : "Delete model"}
            </button>
          </div>
        </Modal>
      )}
      <div className={storageOverQuota ? "quota-banner danger" : "quota-banner"}>
        <div>
          <strong>{storageUsed.toFixed(1)} MB used</strong>
          <span>{storagePercent}% of {quotaMb} MB demo quota</span>
        </div>
        {storageOverQuota && <span>Over quota. Delete inactive model records.</span>}
      </div>
      <div className="storage-bar">
        <div style={{ width: `${Math.min(storagePercent, 100)}%` }} />
      </div>
      <div className="storage-list">
        {storage.map((item) => {
          const version = versions.find((candidate) => candidate.id === item.versionId);
          return (
            <article className="storage-row" key={item.id}>
              <div>
                <strong>{version?.semver ?? item.versionId}</strong>
                <span>{item.key}</span>
              </div>
              <span>{item.sizeMb.toFixed(1)} MB</span>
              <span className={`storage-status status-pill ${item.active ? "production" : "inactive"}`}>{item.active ? "active" : "inactive"}</span>
              <button
                className="danger-button compact"
                disabled={item.active || !isAdmin}
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setPendingDelete({ storageId: item.id, semver: version?.semver ?? item.versionId, key: item.key });
                }}
                title={!isAdmin ? "Admin role required" : item.active ? "Undeploy this model before deleting it" : "Delete this model record and its stored artifacts"}
              >
                <Trash2 size={16} /> Delete model
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ModelDetail({
  version,
  channels,
  deployments,
  runs,
  isAdmin,
}: {
  version: RegistryVersion;
  channels: ReturnType<RegistryStore["getSnapshot"]>["channels"];
  deployments: ReturnType<RegistryStore["getSnapshot"]>["deployments"];
  runs: RegistryRun[];
  isAdmin: boolean;
}) {
  const run = runs.find((candidate) => candidate.id === version.runId);
  const deployedRows = deployments.filter((deployment) => deployment.versionId === version.id);
  const channelNames = Array.from(new Set([
    ...channels.filter((channel) => channel.versionId === version.id).map((channel) => channel.name),
    ...deployedRows.map((deployment) => deployment.channel),
  ]));
  const writeTitle = isAdmin ? "" : "Admin role required";
  const isActive = channelNames.length > 0;
  const isArchived = version.state === "archived";
  const inProduction = channelNames.includes("production");
  const inStaging = channelNames.includes("staging");
  const [pending, setPending] = useState<null | {
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    run: () => Promise<void>;
  }>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(version.semver);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  useEffect(() => {
    setEditingName(false);
    setDraftName(version.semver);
    setRenameError(null);
  }, [version.id, version.semver]);
  async function saveRename() {
    const next = draftName.trim();
    if (!next || next === version.semver) {
      setEditingName(false);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      await store.renameVersion(version.id, next);
      setEditingName(false);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : String(err));
    } finally {
      setRenameBusy(false);
    }
  }
  function askDeploy(channel: ChannelName) {
    if (!isAdmin || isArchived) return;
    setActionError(null);
    setPending({
      title: `Deploy to ${channel}`,
      message: `Deploy ${version.semver} to ${channel} and make it the default model for that channel. Other deployed models on ${channel} remain available for mobile selection.`,
      confirmLabel: `Deploy to ${channel}`,
      run: () => store.deployVersion(version.id, channel, { setDefault: true }),
    });
  }
  function askUndeploy(channel: ChannelName) {
    if (!isAdmin) return;
    setActionError(null);
    setPending({
      title: `Undeploy from ${channel}`,
      message: `Remove ${version.semver} from the ${channel} deployment set. Other deployed models on ${channel} remain available.`,
      confirmLabel: `Undeploy from ${channel}`,
      danger: true,
      run: () => store.undeployChannel(channel, version.id),
    });
  }
  function askArchive() {
    if (!isAdmin || isActive || isArchived) return;
    setActionError(null);
    setPending({
      title: "Archive model",
      message: `Archive ${version.semver}. This permanently deletes the stored Android and iOS artifacts, keeps the model metadata as history, and blocks future deployment.`,
      confirmLabel: "Archive model",
      danger: true,
      run: () => store.archiveVersion(version.id),
    });
  }
  async function confirmPending() {
    if (!pending) return;
    setBusy(true);
    setActionError(null);
    try {
      await pending.run();
      setPending(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="detail-grid">
      <div className="detail-hero">
        <div>
          <div className="detail-title-block">
            {editingName ? (
              <form
                className="detail-rename-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveRename();
                }}
              >
                <input
                  className="detail-rename-input"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  autoFocus
                  disabled={renameBusy}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setEditingName(false);
                      setDraftName(version.semver);
                      setRenameError(null);
                    }
                  }}
                />
                <button type="submit" className="primary-button compact" disabled={renameBusy}>
                  {renameBusy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  className="ghost-button compact"
                  disabled={renameBusy}
                  onClick={() => {
                    setEditingName(false);
                    setDraftName(version.semver);
                    setRenameError(null);
                  }}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                {isArchived && (
                  <span className="archive-version-label">
                    <Archive size={12} aria-hidden="true" />
                    Archived history record
                  </span>
                )}
                <div className="detail-title-row">
                  <h2>{version.semver}</h2>
                  {isAdmin && (
                    <button
                      type="button"
                      className="icon-action-button"
                      aria-label="Rename version"
                      title="Rename this version (used as the public model identifier)"
                      onClick={() => setEditingName(true)}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                  )}
                  <Hint text="This is the selected model package: version tag, dataset lineage, artifact, metrics, and deployment state." />
                </div>
              </>
            )}
          </div>
          {renameError && <p className="form-error">{renameError}</p>}
          {version.originalSemver && version.originalSemver !== version.semver && (
            <p className="detail-original-semver">
              <span className="detail-original-semver-label">Original</span>
              <code>{version.originalSemver}</code>
            </p>
          )}
          <p>{version.dataset}</p>
        </div>
        <div className="detail-hero-actions" aria-label="Lifecycle status">
          <span className={`status-pill ${version.state}`}>{version.state}</span>
        </div>
      </div>
      {pending && (
        <Modal title={pending.title} onClose={() => (busy ? undefined : (setPending(null), setActionError(null)))}>
          <p>{pending.message}</p>
          {actionError && <p className="form-error">{actionError}</p>}
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={() => (setPending(null), setActionError(null))} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className={pending.danger ? "danger-button" : "primary-button"}
              onClick={() => void confirmPending()}
              disabled={busy}
            >
              {busy ? "Working…" : pending.confirmLabel}
            </button>
          </div>
        </Modal>
      )}
      <div>
        <SectionMiniHeading title="Performance" hint="Final validation metrics and artifact identity for this version. Use mAP50 and mask mAP to compare model quality before promotion." />
        <div className="metrics-row">
          <MetricCard label="mAP50" value={pct(version.map50)} detail="box metric" />
          <MetricCard label="Mask mAP" value={pct(version.maskMap)} detail="segmentation metric" />
          <MetricCard label="Artifact" value={`${version.sizeMb.toFixed(1)} MB`} detail={version.contentHash} truncateDetail />
        </div>
      </div>
      <PlatformReadiness version={version} store={store} />
      <DeploymentSection version={version} deployments={deployedRows} />
      <DescriptionSection version={version} isAdmin={isAdmin} />
      <InfoSection
        dataset={version.dataset}
        datasetStats={resolveDatasetStats(version.dataset, version.datasetStats ?? run?.config.datasetStats)}
        sourceWeights={version.sourceWeights}
        accelerator={run ? `Colab ${run.config.colabAccelerator}` : undefined}
        classes={version.classes}
        hyperParameters={version.hyperParameters}
      />
      <div>
        <SectionMiniHeading title="Run" hint="Source training run and notebook reference used to produce this model version." />
        <p className="info-run">{run ? `${run.name} · ${run.colabNotebook || "no notebook recorded"}` : "No linked run"}</p>
        <RunNote note={run?.config.note} />
      </div>
      <div className="detail-actions-bar" aria-label="Lifecycle actions">
        {!isArchived && !inProduction && (
          <button
            className="primary-button compact"
            type="button"
            disabled={!isAdmin || isArchived}
            title={!isAdmin ? writeTitle : isArchived ? "Archived models cannot be deployed" : "Deploy this model to production"}
            onClick={() => askDeploy("production")}
          >
            <Rocket size={14} aria-hidden="true" /> Deploy to Prod
          </button>
        )}
        {!isArchived && !inStaging && (
          <button
            className="ghost-button compact"
            type="button"
            disabled={!isAdmin || isArchived}
            title={!isAdmin ? writeTitle : isArchived ? "Archived models cannot be deployed" : "Deploy this model to staging"}
            onClick={() => askDeploy("staging")}
          >
            <Upload size={14} aria-hidden="true" /> Deploy to Staging
          </button>
        )}
        {channelNames.map((name) => (
          <button
            className="danger-button compact"
            key={name}
            type="button"
            disabled={!isAdmin}
            title={isAdmin ? `Undeploy from ${name}` : writeTitle}
            onClick={() => askUndeploy(name)}
          >
            <LogOut size={14} aria-hidden="true" /> Undeploy {name}
          </button>
        ))}
        {!isArchived && (
          <button
            className="danger-button compact"
            type="button"
            disabled={!isAdmin || isActive}
            title={!isAdmin ? writeTitle : isActive ? "Undeploy this model before archiving it" : "Archive this model, delete stored artifacts, and keep a history record"}
            onClick={askArchive}
          >
            <Archive size={14} aria-hidden="true" /> Archive model
          </button>
        )}
      </div>
    </div>
  );
}

function PlatformReadiness({ version, store }: { version: RegistryVersion; store: RegistryStore }) {
  const isArchived = version.state === "archived";
  const [downloading, setDownloading] = useState<"android" | "ios" | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function downloadArtifact(platform: "android" | "ios", r2Key: string | null | undefined) {
    if (!r2Key || isArchived) return;
    setDownloading(platform);
    setDownloadError(null);
    try {
      const { downloadUrl } = await store.downloadArtifact(r2Key);
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div>
      <SectionMiniHeading title="Platform readiness" hint="Native runtime artifacts packaged with this logical model version." />
      <div className="platform-grid">
        <PlatformArtifactCard
          icon={<Smartphone size={16} aria-hidden="true" />}
          title="Android TF Lite"
          status={isArchived ? "Archived" : `Ready · ${(version.tflitePrecision ?? "int8").toUpperCase()}`}
          detail={isArchived ? "Artifact deleted" : version.tfliteR2Key}
          size={`${version.sizeMb.toFixed(1)} MB`}
          ready={!isArchived}
          disabled={isArchived || downloading !== null}
          busy={downloading === "android"}
          onDownload={() => void downloadArtifact("android", version.tfliteR2Key)}
        />
        <PlatformArtifactCard
          icon={<Apple size={16} aria-hidden="true" />}
          title="iOS Core ML"
          status={isArchived ? "Archived" : version.coremlR2Key ? `Ready · ${(version.coremlPrecision ?? "fp16").toUpperCase()}` : "Missing"}
          detail={isArchived ? "Artifact deleted" : version.coremlR2Key ?? "Core ML artifact missing"}
          size={version.coremlSizeMb ? `${version.coremlSizeMb.toFixed(1)} MB` : "—"}
          ready={!isArchived && Boolean(version.coremlR2Key)}
          disabled={isArchived || !version.coremlR2Key || downloading !== null}
          busy={downloading === "ios"}
          onDownload={() => void downloadArtifact("ios", version.coremlR2Key)}
        />
      </div>
      {downloadError && <p className="form-error">{downloadError}</p>}
    </div>
  );
}

function PlatformArtifactCard({
  icon,
  title,
  status,
  detail,
  size,
  ready,
  disabled,
  busy,
  onDownload,
}: {
  icon: ReactNode;
  title: string;
  status: string;
  detail: string;
  size: string;
  ready: boolean;
  disabled: boolean;
  busy: boolean;
  onDownload: () => void;
}) {
  return (
    <article className={ready ? "platform-card ready" : "platform-card missing"}>
      <div className="platform-card-top">
        <div className="platform-card-title">
          {icon}
          <strong>{title}</strong>
        </div>
        <button
          type="button"
          className="icon-action-button platform-download"
          disabled={disabled}
          onClick={onDownload}
          aria-label={`Download ${title}`}
          title={disabled ? `${title} is not available to download` : `Download ${title}`}
        >
          <Download size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="platform-card-meta">
        <span>{status}</span>
        <small>{size}</small>
      </div>
      <code title={detail}>{detail}</code>
      {busy && <small className="platform-download-status">Preparing signed download...</small>}
    </article>
  );
}

function DeploymentSection({
  version,
  deployments,
}: {
  version: RegistryVersion;
  deployments: ReturnType<RegistryStore["getSnapshot"]>["deployments"];
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const deployedChannels = Array.from(new Set(deployments.map((deployment) => deployment.channel)));
  const defaultChannels = Array.from(new Set(deployments.filter((deployment) => deployment.isDefault).map((deployment) => deployment.channel)));
  const canServeIos = Boolean(version.coremlR2Key);

  async function copyValue(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => current === key ? null : current), 1400);
    } catch {
      setCopiedKey(null);
    }
  }

  return (
    <div className="deployment-section">
      <SectionMiniHeading title="Deployment" hint="Mobile-facing channels and endpoint contracts for consuming this model from native Android and iOS apps." />
      {deployments.length === 0 ? (
        <p className="description-empty">Not deployed to staging or production. Mobile apps cannot list or resolve this model until it is deployed.</p>
      ) : (
        <div className="mobile-integration-panel">
          <div className="mobile-integration-summary">
            <div>
              <strong>Mobile consumption</strong>
              <span>Use list/select for model pickers, or resolve-channel for a default-model update check.</span>
            </div>
            <div className="mobile-contract-chips" aria-label="Mobile artifact readiness">
              <span className="status-pill succeeded"><Smartphone size={12} aria-hidden="true" /> Android ready</span>
              <span className={canServeIos ? "status-pill succeeded" : "status-pill failed"}>
                <Apple size={12} aria-hidden="true" /> {canServeIos ? "iOS ready" : "iOS missing"}
              </span>
            </div>
          </div>
          <div className="mobile-contract-grid">
            <article className="mobile-contract-card">
              <strong>List selectable models</strong>
              <span>Returns all active deployments for a channel, default flags, signed artifact URLs, hashes, size, compat signature, and metadata.</span>
              {deployedChannels.map((channel) => (
                <div className="endpoint-group" key={`list-${channel}`}>
                  <span className={`status-pill ${channel}`}>{channel}</span>
                  <EndpointRow
                    icon={<Smartphone size={13} aria-hidden="true" />}
                    label="Android"
                    value={listModelsEndpoint(channel, "android")}
                    copied={copiedKey === `list-${channel}-android`}
                    onCopy={() => void copyValue(`list-${channel}-android`, listModelsEndpoint(channel, "android"))}
                  />
                  <EndpointRow
                    icon={<Apple size={13} aria-hidden="true" />}
                    label="iOS"
                    value={listModelsEndpoint(channel, "ios")}
                    copied={copiedKey === `list-${channel}-ios`}
                    onCopy={() => void copyValue(`list-${channel}-ios`, listModelsEndpoint(channel, "ios"))}
                  />
                </div>
              ))}
            </article>
            <article className="mobile-contract-card">
              <strong>Resolve default model</strong>
              <span>Use at app startup or sync time. It returns update, noop, rebuild_required, or artifact_missing for the channel default.</span>
              {defaultChannels.length === 0 ? (
                <p className="description-empty">This version is selectable but not the channel default.</p>
              ) : defaultChannels.map((channel) => (
                <div className="endpoint-group" key={`resolve-${channel}`}>
                  <span className={`status-pill ${channel}`}>{channel}</span>
                  <EndpointRow
                    icon={<Smartphone size={13} aria-hidden="true" />}
                    label="Android"
                    value={resolveChannelEndpoint(channel, "android")}
                    copied={copiedKey === `resolve-${channel}-android`}
                    onCopy={() => void copyValue(`resolve-${channel}-android`, resolveChannelEndpoint(channel, "android"))}
                  />
                  <EndpointRow
                    icon={<Apple size={13} aria-hidden="true" />}
                    label="iOS"
                    value={resolveChannelEndpoint(channel, "ios")}
                    copied={copiedKey === `resolve-${channel}-ios`}
                    onCopy={() => void copyValue(`resolve-${channel}-ios`, resolveChannelEndpoint(channel, "ios"))}
                  />
                </div>
              ))}
            </article>
          </div>
          <div className="mobile-contract-note">
            <strong>Response keys to wire into the app</strong>
            <code>version_id · semver · artifact_url/model_url · content_hash · size_bytes · compat_signature · metadata</code>
          </div>
        </div>
      )}
      {deployments.length > 0 && (
        <div className="deployment-list-block">
          <div className="deployment-list-heading">
            <div>
              <strong>Active deployments</strong>
              <span>Where this version is available to mobile clients.</span>
            </div>
          </div>
          <div className="deployment-list">
            {deployments.map((deployment) => (
              <article className="deployment-row" key={deployment.id}>
                <div className="deployment-row-main">
                  <span className={`status-pill ${deployment.channel}`}>{deployment.channel}</span>
                  <div>
                    <strong>{deployment.isDefault ? "Default model" : "Selectable model"}</strong>
                    <span>{deployment.deployedAt ? `Deployed ${deployment.deployedAt}` : "Deployed recently"}</span>
                  </div>
                </div>
                <div className="deployment-platforms">
                  <span className="status-pill succeeded">Android TF Lite</span>
                  <span className={canServeIos ? "status-pill succeeded" : "status-pill failed"}>
                    {canServeIos ? "iOS Core ML" : "iOS missing"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      {deployments.length > 0 && !version.coremlR2Key && (
        <p className="form-error">iOS consumers will see this deployment as artifact_missing until Core ML export succeeds.</p>
      )}
    </div>
  );
}

function EndpointRow({
  icon,
  label,
  value,
  copied,
  onCopy,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="endpoint-row">
      <span className="endpoint-label">{icon}{label}</span>
      <code title={value}>{value}</code>
      <button
        type="button"
        className={copied ? "icon-action-button endpoint-copy copied" : "icon-action-button endpoint-copy"}
        onClick={onCopy}
        aria-label={`Copy ${label} endpoint`}
        title={copied ? "Copied" : "Copy endpoint"}
      >
        <Copy size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

function RunList({
  runs,
  onSelect,
  selectedId,
  onDelete,
  versionByRunId,
  onOpenModelVersion,
}: {
  runs: RegistryRun[];
  onSelect?: (runId: string) => void;
  selectedId?: string | null;
  onDelete?: (run: RegistryRun) => void;
  versionByRunId?: Map<string, RegistryVersion>;
  onOpenModelVersion?: (versionId: string) => void;
}) {
  return (
    <div className="run-list">
      {runs.map((run) => (
        <RunRow
          run={run}
          key={run.id}
          onClick={onSelect ? () => onSelect(run.id) : undefined}
          selected={selectedId === run.id}
          onDelete={onDelete}
          modelVersion={versionByRunId?.get(run.id)}
          onOpenModelVersion={onOpenModelVersion}
        />
      ))}
    </div>
  );
}

function RunDetail({ run }: { run: RegistryRun }) {
  return (
    <div className="run-detail">
      <div className="progress-track">
        <div style={{ width: `${run.progress}%` }} />
      </div>
      <RunNote note={run.config.note} />
      <RunLogs run={run} />
      <InfoSection
        dataset={run.config.dataset}
        datasetStats={resolveDatasetStats(run.config.dataset, run.config.datasetStats ?? run.datasetStats)}
        sourceWeights={run.config.sourceWeights}
        accelerator={`Colab ${run.config.colabAccelerator}`}
        classes={run.config.classes}
        hyperParameters={run.config.hyperParameters}
      />
    </div>
  );
}

function RunNote({ note }: { note?: string }) {
  const trimmed = (note ?? "").trim();
  if (!trimmed) return null;
  return (
    <section className="run-note-block" aria-label="Run note">
      <span className="run-note-label">Note</span>
      <p className="run-note-text">{trimmed}</p>
    </section>
  );
}

function RunLogs({ run }: { run: RegistryRun }) {
  const lines = expertLogLines(run);
  const empty = lines.length === 0;
  return (
    <section className="run-logs" aria-label="Run logs">
      <header>
        <span className="run-logs-title">Run logs</span>
        <span className="run-logs-count">{empty ? "0 lines" : `${lines.length} line${lines.length === 1 ? "" : "s"}`}</span>
      </header>
      <pre className={empty ? "empty" : undefined}>
        {empty ? "No logs reported yet." : lines.join("\n")}
      </pre>
    </section>
  );
}

function DescriptionSection({ version, isAdmin }: { version: RegistryVersion; isAdmin: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(version.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setEditing(false);
    setDraft(version.description ?? "");
    setError(null);
  }, [version.id, version.description]);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await store.updateVersionDescription(version.id, draft);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="description-header">
        <SectionMiniHeading
          title="Description"
          hint="Free-form note describing this model version — use it for change-log entries, evaluation context, or operational reminders."
        />
        {!editing && isAdmin && (
          <button
            type="button"
            className="ghost-button compact"
            onClick={() => setEditing(true)}
          >
            <Pencil size={12} aria-hidden="true" /> {version.description ? "Edit" : "Add note"}
          </button>
        )}
      </div>
      {editing ? (
        <>
          <textarea
            className="dna-textarea"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            disabled={busy}
            autoFocus
            placeholder="Notes about this version — purpose, validation context, anything worth remembering."
          />
          <div className="description-actions">
            <button type="button" className="primary-button compact" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="ghost-button compact"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setDraft(version.description ?? "");
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </>
      ) : (
        <p className={version.description ? "description-text" : "description-empty"}>
          {version.description || "No description yet."}
        </p>
      )}
    </div>
  );
}

function InfoSection({
  dataset,
  datasetStats,
  sourceWeights,
  accelerator,
  classes,
  hyperParameters,
}: {
  dataset: string;
  datasetStats?: DatasetStats;
  sourceWeights: string;
  accelerator?: string;
  classes: string[];
  hyperParameters: TrainConfig["hyperParameters"];
}) {
  const hpEntries = Object.entries(hyperParameters);
  const resolvedStats = resolveDatasetStats(dataset, datasetStats);
  return (
    <div className="info-section">
      <div className="info-block">
        <SectionMiniHeading title="Training config" hint="Dataset source, checkpoint, accelerator, and image size used when this run or model version was created." />
        <dl className="info-grid">
          <dt>Dataset</dt>
          <dd className="mono">{dataset || "—"}</dd>
          <dt>Source weights</dt>
          <dd className="mono">{sourceWeights || "—"}</dd>
          {accelerator && <><dt>Accelerator</dt><dd>{accelerator}</dd></>}
          <dt>Image size</dt>
          <dd>{hyperParameters.imgsz} px</dd>
        </dl>
      </div>
      <div className="info-block">
        <SectionMiniHeading title="Dataset" hint="Dataset composition from the YAML and known split counts. Train, validation, and testing splits should match the dataset config used by YOLO." />
        <dl className="info-grid">
          <dt>Config</dt>
          <dd className="mono">{dataset || "—"}</dd>
          <dt>Classes</dt>
          <dd>{classes.length} total</dd>
          {typeof resolvedStats?.total === "number" && (
            <>
              <dt>Records</dt>
              <dd>{resolvedStats.total.toLocaleString()}</dd>
            </>
          )}
        </dl>
        <DatasetSplitScroller stats={resolvedStats} />
        <div className="chip-list">{classes.map((name) => <span key={name}>{name}</span>)}</div>
      </div>
      <div className="info-block">
        <SectionMiniHeading title="Hyperparameters" hint="Core YOLO training knobs recorded with the run, including epochs, image size, patience, learning rate, and augmentation settings." />
        <dl className="info-grid two-col">
          {hpEntries.map(([key, value]) => (
            <Fragment key={key}>
              <dt>{key}</dt>
              <dd className="mono">{String(value)}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </div>
  );
}

function RunRow({
  run,
  onClick,
  selected = false,
  onDelete,
  modelVersion,
  onOpenModelVersion,
}: {
  run: RegistryRun;
  onClick?: () => void;
  selected?: boolean;
  onDelete?: (run: RegistryRun) => void;
  modelVersion?: RegistryVersion;
  onOpenModelVersion?: (versionId: string) => void;
}) {
  const cls = ["run-row", onClick ? "clickable" : "", selected ? "selected" : ""].filter(Boolean).join(" ");
  const status = displayRunStatus(run);
  const showDelete = status === "waiting" && Boolean(onDelete);
  const showModelShortcut = status === "succeeded" && Boolean(modelVersion && onOpenModelVersion);
  const showActions = showDelete || showModelShortcut;
  const inner = (
    <>
      <div className={`status-dot ${status}`} aria-hidden="true" />
      <div className="run-main">
        <strong>{run.name}</strong>
        <span>{run.id}</span>
      </div>
      <div className="run-metrics">
        <span className={`run-status-pill status-pill ${status}`}>{status}</span>
        <span className="run-progress">{run.progress}%</span>
        {run.map50 !== null && <span>{pct(run.map50)} mAP50</span>}
        {run.maskMap !== null && <span>{pct(run.maskMap)} mask</span>}
      </div>
    </>
  );
  if (onClick) {
    return (
      <div className={showActions ? "run-row-wrapper has-actions" : "run-row-wrapper"}>
        <button type="button" className={cls} onClick={onClick} aria-pressed={selected}>
          {inner}
        </button>
        {showActions && (
          <div className="run-row-actions">
            {showModelShortcut && modelVersion && (
              <button
                type="button"
                className="icon-action-button primary run-row-model-shortcut"
                aria-label={`Open trained model ${modelVersion.semver}`}
                title={`Open trained model ${modelVersion.semver}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenModelVersion?.(modelVersion.id);
                }}
              >
                <ArrowUpRight size={14} aria-hidden="true" />
              </button>
            )}
            {showDelete && (
              <button
                type="button"
                className="icon-action-button danger run-row-delete"
                aria-label={`Delete waiting run ${run.name}`}
                title="Delete this waiting run"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete?.(run);
                }}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }
  return <article className={cls}>{inner}</article>;
}

function MetricCard({
  label,
  value,
  detail,
  danger = false,
  truncateDetail = false,
}: {
  label: string;
  value: string;
  detail: string;
  danger?: boolean;
  truncateDetail?: boolean;
}) {
  return (
    <article className={danger ? "metric-card danger" : "metric-card"}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={truncateDetail ? "truncate" : undefined} title={truncateDetail ? detail : undefined}>{detail}</small>
    </article>
  );
}

function SectionHeading({ title, text }: { title: string; text: string }) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </div>
  );
}

function Step({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <article className="journey-step">
      <span className="step-icon" aria-hidden="true">{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </article>
  );
}

function NumberField({
  label,
  value,
  step = "1",
  onChange,
  hint,
}: {
  label: string;
  value: number;
  step?: string;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <label>
      <span className="label-text">
        {label}
        {hint && <Hint text={hint} />}
      </span>
      <input type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function resolveChannel(
  channels: ReturnType<RegistryStore["getSnapshot"]>["channels"],
  versions: RegistryVersion[],
  name: ChannelName,
) {
  const versionId = channels.find((c) => c.name === name)?.versionId;
  return versions.find((v) => v.id === versionId);
}

function updateHp<K extends keyof TrainConfig["hyperParameters"]>(
  config: TrainConfig,
  setConfig: (config: TrainConfig) => void,
  key: K,
  value: TrainConfig["hyperParameters"][K],
) {
  setConfig({ ...config, hyperParameters: { ...config.hyperParameters, [key]: value } });
}

function sectionTitle(section: Section) {
  return {
    overview: "Model operations",
    train: "Train pipeline",
    models: "Model lifecycle",
    storage: "Storage control",
  }[section];
}

function sectionDescription(section: Section) {
  return {
    overview: "Operate the demo registry from login to deployment.",
    train: "Define classes, tune hyperparameters, and hand the run to manual Colab.",
    models: "Inspect config and deploy or undeploy trained model versions.",
    storage: "Track R2 quota and delete inactive artifacts safely.",
  }[section];
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

const COLAB_NOTEBOOK_URL =
  "https://colab.research.google.com/github/phongsakorn-ipassion/advance-seeds-field-inspector-ml/blob/main/notebooks/train_run.ipynb";

function colabUrl(runId: string) {
  return `${COLAB_NOTEBOOK_URL}?run_id=${encodeURIComponent(runId)}`;
}
