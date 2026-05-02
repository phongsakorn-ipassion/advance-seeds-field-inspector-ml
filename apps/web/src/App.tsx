import { FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Activity,
  Database,
  Info,
  LogOut,
  Rocket,
  ShieldCheck,
  Sprout,
  Trash2,
  Wand2,
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
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [loginError, setLoginError] = useState("");
  const [trainConfig, setTrainConfig] = useState<TrainConfig>(defaultConfig);

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
          />
        )}

        {section === "train" && (
          <TrainWorkflow
            config={trainConfig}
            setConfig={setTrainConfig}
            runs={snapshot.runs}
            isAdmin={isAdmin}
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
}: {
  production?: RegistryVersion;
  staging?: RegistryVersion;
  runs: RegistryRun[];
  storageUsed: number;
  quota: number;
  storagePercent: number;
  storageOverQuota: boolean;
  onOpenTrain: () => void;
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
          <SectionHeading title="Live runs" text="Reported by the Python SDK; Colab MCP context is preserved per run." />
          <RunList runs={runs.slice(0, 4)} />
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
  onStart,
}: {
  config: TrainConfig;
  setConfig: (config: TrainConfig) => void;
  runs: RegistryRun[];
  isAdmin: boolean;
  onStart: () => void;
}) {
  const running = runs.find((r) => r.status === "running");
  const focused = running ?? runs[0];
  const recent = runs.filter((r) => r.id !== focused?.id).slice(0, 6);
  const focusedTone = running ? "running" : "recent";
  return (
    <section className="train-layout">
    <section className="content-grid wide-left">
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
            <Hint text="Path to the YOLO dataset YAML. Should reference train/val/test splits and class names. Use the latest banana-v2 config for the PoC." />
          </span>
          <input value={config.dataset} onChange={(event) => setConfig({ ...config, dataset: event.target.value })} />
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
        <label>
          <span className="label-text">
            Classes
            <Hint text="One class name per line. Order matters — must match the dataset's class indices. Adding or removing classes invalidates compat with prior versions." />
          </span>
          <textarea
            value={config.classes.join("\n")}
            onChange={(event) => setConfig({ ...config, classes: splitLines(event.target.value) })}
            rows={6}
          />
        </label>
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
      <section className="panel">
        <SectionHeading title="Live tracking" text="Realtime metric stream from the Python SDK to Supabase." />
        {focused ? (
          <>
            <div className="track-banner">
              <span className={`status-pill ${focusedTone === "running" ? "staging" : "candidate"}`}>
                {focusedTone === "running" ? "Running now" : "Most recent"}
              </span>
              <span className="track-meta">{focused.hardware} · {focused.colabNotebook}</span>
            </div>
            <RunDetail run={focused} />
          </>
        ) : (
          <EmptyState
            icon={<Wand2 size={24} />}
            title="No training runs yet"
            text="Configure the form on the left and start a Colab MCP run to see live metrics here."
          />
        )}
      </section>
    </section>
    <section className="panel">
      <SectionHeading title="Recent training runs" text="History from this model line. Realtime updates flow in as the SDK reports them." />
      {recent.length > 0 ? (
        <RunList runs={recent} />
      ) : (
        <EmptyState
          icon={<Activity size={24} />}
          title="No prior runs"
          text="Once a run completes it shows up here with its final metrics and Colab notebook context."
        />
      )}
    </section>
    </section>
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
      <div>
        <h3>Classes</h3>
        <div className="chip-list">{version.classes.map((name) => <span key={name}>{name}</span>)}</div>
      </div>
      <div>
        <h3>Hyperparameters</h3>
        <pre>{JSON.stringify(version.hyperParameters, null, 2)}</pre>
      </div>
      <div>
        <h3>Run</h3>
        <p>{run ? `${run.name} / ${run.colabNotebook}` : "No linked run"}</p>
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

function RunList({ runs }: { runs: RegistryRun[] }) {
  return <div className="run-list">{runs.map((run) => <RunRow run={run} key={run.id} />)}</div>;
}

function RunDetail({ run }: { run: RegistryRun }) {
  return (
    <div className="run-detail">
      <RunRow run={run} />
      <div className="progress-track">
        <div style={{ width: `${run.progress}%` }} />
      </div>
      <pre>{run.logs.join("\n")}</pre>
    </div>
  );
}

function RunRow({ run }: { run: RegistryRun }) {
  return (
    <article className="run-row">
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
    </article>
  );
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

function splitLines(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
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
