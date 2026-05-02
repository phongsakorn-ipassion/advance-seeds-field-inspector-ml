import { Fragment, FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import {
  Activity,
  Database,
  ExternalLink,
  Info,
  LogOut,
  Notebook,
  Rocket,
  ShieldCheck,
  Sprout,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import {
  ChannelName,
  defaultConfig,
  RegistryRun,
  RegistryStore,
  RegistryVersion,
  TrainConfig,
  createRegistryStore,
} from "./registry";

type Section = "overview" | "train" | "models" | "storage";
type TrainTab = "form" | "live" | "recent";

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

function parseYoloClasses(yaml: string): string[] | null {
  // Supports either:
  //   names: [apple, banana, ...]
  //   names:
  //     - apple
  //     - banana
  //   names:
  //     0: apple
  //     1: banana
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

function DatasetConfigField({
  value,
  onChange,
  modelLineSlug,
  disabled,
  onClassesParsed,
}: {
  value: string;
  onChange: (next: string) => void;
  modelLineSlug: string;
  disabled?: boolean;
  onClassesParsed?: (classes: string[]) => void;
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
        const { r2Key } = await store.uploadDataset(file, modelLineSlug || "seeds-poc");
        onChange(r2Key);
        if (classes && onClassesParsed) onClassesParsed(classes);
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
          placeholder="configs/dataset.banana-v2.yaml or datasets/seeds-poc/.../file.yaml"
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

  function openRun(runId: string) {
    setFocusedRunId(runId);
    setSection("train");
    const run = snapshot.runs.find((r) => r.id === runId);
    setTrainTab(run?.status === "running" ? "live" : "recent");
  }

  // Manual sub-nav clicks clear the focused run so the detail panel
  // doesn't bleed across Live tracking ↔ Recent runs.
  function changeTrainTab(next: TrainTab) {
    setTrainTab(next);
    setFocusedRunId(null);
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
          <span className="topbar-user">
            <ShieldCheck size={14} aria-hidden="true" />
            {session.email}
            <span className="role">· {isAdmin ? "admin" : "read-only"}</span>
          </span>
          <button className="ghost-button compact" type="button" onClick={() => void store.signOut()}>
            <LogOut size={14} /> Sign out
          </button>
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
            onStart={() => void store.startTraining(trainConfig)}
          />
        )}

        {section === "models" && selectedVersion && (
          <ModelsWorkflow
            channels={snapshot.channels}
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
        <MetricCard label="Training" value={running?.name ?? "Idle"} detail={running ? `${running.progress}% via ${running.hardware}` : "Colab MCP ready"} />
        <MetricCard label="R2 storage" value={`${storageUsed.toFixed(1)} / ${quota} MB`} detail={storageOverQuota ? "Over quota" : `${storagePercent}% used`} danger={storageOverQuota} />
      </section>
      <section className="content-grid">
        <section className="panel">
          <SectionHeading title="Operator journey" text="One path from training config to deployment." />
          <div className="journey-list">
            <Step icon={<Wand2 size={18} />} title="Train" text="Define classes and hyperparameters, then create a Colab MCP run." />
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
          <RunList runs={runs.slice(0, 4)} onSelect={onOpenRun} />
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
  onStart: () => void;
}) {
  const runningRuns = runs.filter((r) => r.status === "running");
  const focused = focusedRunId ? runs.find((r) => r.id === focusedRunId) : undefined;
  const recent = runs.filter((r) => r.status !== "running").slice(0, 6);
  const isFocusedRunning = focused?.status === "running";
  const [howOpen, setHowOpen] = useState(false);

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
              <a
                className="primary-button compact"
                href={colabUrl(focused.id)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Notebook size={14} /> Open in Colab <ExternalLink size={12} />
              </a>
              <button type="button" className="ghost-button compact" onClick={() => setFocusedRunId(null)} aria-label="Close run detail">
                <X size={14} /> Close
              </button>
            </div>
          </div>
          {isFocusedRunning && focused.map50 === null && (
            <div className="track-hint">
              <Info size={14} aria-hidden="true" />
              <span>
                Waiting for the Python SDK to stream <code>run_metrics</code>. Until the
                training script writes metrics for this run, only the bootstrap log is shown.
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
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (isAdmin) onStart();
      }}
    >
      <SectionHeading title="Train new model" text="Defaults are loaded from the current PoC config. Adjust only what the demo needs." />
        <label>
          <span className="label-text">
            Dataset config
            <Hint text="Reference to a YOLO dataset YAML. You can paste a path the trainer already has on disk, OR upload a .yaml file here so the trainer can pull it from R2. Image data is still expected to be reachable by the trainer; this only uploads the YAML." />
          </span>
          <DatasetConfigField
            value={config.dataset}
            onChange={(next) => setConfig({ ...config, dataset: next })}
            modelLineSlug={config.modelLine}
            disabled={!isAdmin}
            onClassesParsed={(classes) => setConfig({ ...config, dataset: config.dataset, classes })}
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
        <label>
          <span className="label-text">
            Colab accelerator
            <Hint text="Colab GPU class. T4 is free-tier and fine for YOLO-n. L4 is faster and worth it for longer runs. A100 is overkill for the PoC unless you're benchmarking." />
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
      <button className="primary-button" type="submit" disabled={!isAdmin} title={isAdmin ? "" : "Admin role required"}>
        <Rocket size={18} /> Start Colab MCP training
      </button>
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
            <RunList runs={runningRuns} selectedId={focused?.id ?? null} onSelect={(id) => setFocusedRunId(id)} />
          ) : (
            <EmptyState
              icon={<Wand2 size={24} />}
              title="No runs in progress"
              text="Switch to Train new model to start a Colab MCP run."
            />
          )}
        </section>
        {detailPanel}
      </>
    )}

    {tab === "recent" && (
      <>
        <section className="panel">
          <SectionHeading title="Recent training runs" text="History from this model line. Click any row to open full detail below." />
          {recent.length > 0 ? (
            <RunList runs={recent} selectedId={focused?.id ?? null} onSelect={(id) => setFocusedRunId(id)} />
          ) : (
            <EmptyState
              icon={<Activity size={24} />}
              title="No prior runs"
              text="Once a run completes it shows up here with its final metrics and Colab notebook context."
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
          This dashboard is the <em>registry</em>. Clicking <em>Start Colab MCP training</em>{" "}
          inserts a <code>runs</code> row in Supabase with the config below — it does
          not download the dataset or run YOLO. The dataset path (e.g.{" "}
          <code>configs/dataset.banana-v2.yaml</code>) only resolves on a machine that
          has the repo and the images on disk.
        </p>
        <p>
          Live metrics appear here when{" "}
          <code>scripts/train_yolo26n_seg.py</code> is run against this run id with the
          Python SDK and a service-role key — typically inside a Colab notebook started
          through the Colab MCP server. Until that script writes to{" "}
          <code>run_metrics</code>, only the bootstrap log is shown.
        </p>
        <p>
          A separate OpenSpec change (<code>wire-dashboard-to-hosted-training</code>)
          scopes a hosted-GPU path so a stranger with the dashboard URL can start a
          real run end-to-end without local repo access.
        </p>
      </Modal>
    )}
    </section>
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
  icon: React.ReactNode;
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
  versions,
  runs,
  selectedVersion,
  selectedVersionId,
  setSelectedVersionId,
  isAdmin,
}: {
  channels: ReturnType<RegistryStore["getSnapshot"]>["channels"];
  versions: RegistryVersion[];
  runs: RegistryRun[];
  selectedVersion: RegistryVersion;
  selectedVersionId: string;
  setSelectedVersionId: (id: string) => void;
  isAdmin: boolean;
}) {
  return (
    <section className="content-grid wide-right">
      <section className="panel">
        <SectionHeading title="Model versions" text="Select a model, then deploy or undeploy channels." />
        <div className="version-list">
          {versions.map((version) => (
            <button
              className={version.id === selectedVersionId ? "version-card selected" : "version-card"}
              key={version.id}
              type="button"
              onClick={() => setSelectedVersionId(version.id)}
            >
              <strong>{version.semver}</strong>
              <span>{version.dataset}</span>
              <small>
                {pct(version.map50)} mAP50 / {pct(version.maskMap)} mask
              </small>
              <span className={`status-pill ${version.state}`}>{version.state}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="panel detail-panel">
        <SectionHeading title="Model detail" text="Metrics, classes, config, artifact, and deployment state." />
        <ModelDetail version={selectedVersion} channels={channels} runs={runs} isAdmin={isAdmin} />
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
  return (
    <section className="panel">
      <SectionHeading title="R2 storage" text="Monitor artifact usage and delete inactive models before storage exceeds quota." />
      <div className={storageOverQuota ? "quota-banner danger" : "quota-banner"}>
        <div>
          <strong>{storageUsed.toFixed(1)} MB used</strong>
          <span>{storagePercent}% of {quotaMb} MB demo quota</span>
        </div>
        {storageOverQuota && <span>Over quota. Delete inactive artifacts.</span>}
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
              <span className={item.active ? "status-pill production" : "status-pill inactive"}>{item.active ? "active" : "inactive"}</span>
              <button
                className="danger-button compact"
                disabled={item.active || !isAdmin}
                type="button"
                onClick={() => void store.deleteInactiveArtifact(item.id)}
                title={!isAdmin ? "Admin role required" : ""}
              >
                <Trash2 size={16} /> Delete
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
  runs,
  isAdmin,
}: {
  version: RegistryVersion;
  channels: ReturnType<RegistryStore["getSnapshot"]>["channels"];
  runs: RegistryRun[];
  isAdmin: boolean;
}) {
  const run = runs.find((candidate) => candidate.id === version.runId);
  const channelNames = channels.filter((channel) => channel.versionId === version.id).map((channel) => channel.name);
  const writeTitle = isAdmin ? "" : "Admin role required";
  return (
    <div className="detail-grid">
      <div className="detail-hero">
        <div>
          <h2>{version.semver}</h2>
          <p>{version.dataset}</p>
        </div>
        <span className={`status-pill ${version.state}`}>{version.state}</span>
      </div>
      <div className="metrics-row">
        <MetricCard label="mAP50" value={pct(version.map50)} detail="box metric" />
        <MetricCard label="Mask mAP" value={pct(version.maskMap)} detail="segmentation metric" />
        <MetricCard label="Artifact" value={`${version.sizeMb.toFixed(1)} MB`} detail={version.contentHash} />
      </div>
      <InfoSection
        dataset={version.dataset}
        sourceWeights={version.sourceWeights}
        accelerator={run ? `Colab ${run.config.colabAccelerator}` : undefined}
        classes={version.classes}
        hyperParameters={version.hyperParameters}
      />
      <div>
        <h3>Run</h3>
        <p className="info-run">{run ? `${run.name} · ${run.colabNotebook || "no notebook recorded"}` : "No linked run"}</p>
      </div>
      <div className="button-row">
        <button className="primary-button" type="button" disabled={!isAdmin} title={writeTitle} onClick={() => void store.deployVersion(version.id, "production")}>
          Deploy production
        </button>
        <button className="ghost-button" type="button" disabled={!isAdmin} title={writeTitle} onClick={() => void store.deployVersion(version.id, "staging")}>
          Deploy staging
        </button>
        {channelNames.map((name) => (
          <button className="danger-button" key={name} type="button" disabled={!isAdmin} title={writeTitle} onClick={() => void store.undeployChannel(name)}>
            Undeploy {name}
          </button>
        ))}
      </div>
    </div>
  );
}

function RunList({
  runs,
  onSelect,
  selectedId,
}: {
  runs: RegistryRun[];
  onSelect?: (runId: string) => void;
  selectedId?: string | null;
}) {
  return (
    <div className="run-list">
      {runs.map((run) => (
        <RunRow
          run={run}
          key={run.id}
          onClick={onSelect ? () => onSelect(run.id) : undefined}
          selected={selectedId === run.id}
        />
      ))}
    </div>
  );
}

function RunDetail({ run }: { run: RegistryRun }) {
  return (
    <div className="run-detail">
      <RunRow run={run} />
      <div className="progress-track">
        <div style={{ width: `${run.progress}%` }} />
      </div>
      <RunLogs lines={run.logs} />
      <InfoSection
        dataset={run.config.dataset}
        sourceWeights={run.config.sourceWeights}
        accelerator={`Colab ${run.config.colabAccelerator}`}
        classes={run.config.classes}
        hyperParameters={run.config.hyperParameters}
      />
    </div>
  );
}

function RunLogs({ lines }: { lines: string[] }) {
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

function InfoSection({
  dataset,
  sourceWeights,
  accelerator,
  classes,
  hyperParameters,
  datasetCount,
}: {
  dataset: string;
  sourceWeights: string;
  accelerator?: string;
  classes: string[];
  hyperParameters: TrainConfig["hyperParameters"];
  datasetCount?: number;
}) {
  const hpEntries = Object.entries(hyperParameters);
  return (
    <div className="info-section">
      <div className="info-block">
        <h3>Training config</h3>
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
        <h3>Dataset</h3>
        <dl className="info-grid">
          <dt>Config</dt>
          <dd className="mono">{dataset || "—"}</dd>
          <dt>Classes</dt>
          <dd>{classes.length} total</dd>
          {typeof datasetCount === "number" && (
            <>
              <dt>Records</dt>
              <dd>{datasetCount.toLocaleString()}</dd>
            </>
          )}
        </dl>
        <div className="chip-list">{classes.map((name) => <span key={name}>{name}</span>)}</div>
      </div>
      <div className="info-block">
        <h3>Hyperparameters</h3>
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
}: {
  run: RegistryRun;
  onClick?: () => void;
  selected?: boolean;
}) {
  const cls = ["run-row", onClick ? "clickable" : "", selected ? "selected" : ""].filter(Boolean).join(" ");
  const inner = (
    <>
      <div className={`status-dot ${run.status}`} aria-hidden="true" />
      <div className="run-main">
        <strong>{run.name}</strong>
        <span>{run.id}</span>
      </div>
      <div className="run-metrics">
        <span>{run.status}</span>
        <span>{run.progress}%</span>
        <span>{run.map50 === null ? "mAP pending" : `${pct(run.map50)} mAP50`}</span>
        <span>{run.maskMap === null ? "mask pending" : `${pct(run.maskMap)} mask`}</span>
      </div>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-pressed={selected}>
        {inner}
      </button>
    );
  }
  return <article className={cls}>{inner}</article>;
}

function MetricCard({ label, value, detail, danger = false }: { label: string; value: string; detail: string; danger?: boolean }) {
  return (
    <article className={danger ? "metric-card danger" : "metric-card"}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
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
    models: "Model CRUD",
    storage: "Storage control",
  }[section];
}

function sectionDescription(section: Section) {
  return {
    overview: "Operate the demo registry from login to deployment.",
    train: "Define classes, tune hyperparameters, and hand the run to Colab MCP.",
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
