import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Database,
  GitBranch,
  History,
  LogOut,
  Rocket,
  ShieldCheck,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  ChannelName,
  defaultConfig,
  demoAdmin,
  initialState,
  RegistryRun,
  RegistryState,
  RegistryVersion,
  TrainConfig,
} from "./registryData";

type Section = "overview" | "train" | "models" | "storage";

export function App() {
  const [state, setState] = useState<RegistryState>(initialState);
  const [section, setSection] = useState<Section>("overview");
  const [selectedVersionId, setSelectedVersionId] = useState(state.versions[0]?.id ?? "");
  const [loginError, setLoginError] = useState("");
  const [trainConfig, setTrainConfig] = useState<TrainConfig>(defaultConfig);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setState((current) => advanceRunningJobs(current));
    }, 1500);
    return () => window.clearInterval(timer);
  }, []);

  const selectedVersion = state.versions.find((version) => version.id === selectedVersionId) ?? state.versions[0];
  const storageUsed = state.storage.reduce((sum, item) => sum + item.sizeMb, 0);
  const storagePercent = Math.round((storageUsed / state.quotaMb) * 100);
  const storageOverQuota = storageUsed > state.quotaMb;
  const production = resolveChannel(state, "production");
  const staging = resolveChannel(state, "staging");

  if (!state.adminEmail) {
    return <LoginScreen onLogin={(email, password) => handleLogin(email, password, setState, setLoginError)} error={loginError} />;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Model registry navigation">
        <div className="brand">
          <div className="brand-mark">AS</div>
          <div>
            <strong>Advance Seeds</strong>
            <span>Model Registry</span>
          </div>
        </div>
        <nav>
          <button className={section === "overview" ? "active" : ""} onClick={() => setSection("overview")} type="button">
            <Activity size={18} />
            Overview
          </button>
          <button className={section === "train" ? "active" : ""} onClick={() => setSection("train")} type="button">
            <Wand2 size={18} />
            Train
          </button>
          <button className={section === "models" ? "active" : ""} onClick={() => setSection("models")} type="button">
            <GitBranch size={18} />
            Models
          </button>
          <button className={section === "storage" ? "active" : ""} onClick={() => setSection("storage")} type="button">
            <Database size={18} />
            Storage
          </button>
        </nav>
        <div className="sidebar-footer">
          <ShieldCheck size={18} />
          <div>
            <strong>{state.adminEmail}</strong>
            <span>Pre-created admin role</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{sectionTitle(section)}</h1>
            <p>{sectionDescription(section)}</p>
          </div>
          <button className="ghost-button" type="button" onClick={() => setState((current) => ({ ...current, adminEmail: null }))}>
            <LogOut size={18} />
            Sign out
          </button>
        </header>

        {section === "overview" && (
          <Overview
            production={production}
            staging={staging}
            runs={state.runs}
            storageUsed={storageUsed}
            quota={state.quotaMb}
            storagePercent={storagePercent}
            storageOverQuota={storageOverQuota}
            onOpenTrain={() => setSection("train")}
            onOpenStorage={() => setSection("storage")}
          />
        )}

        {section === "train" && (
          <TrainWorkflow
            config={trainConfig}
            setConfig={setTrainConfig}
            runs={state.runs}
            onStart={() => {
              const run = createTrainingRun(trainConfig);
              setState((current) => ({ ...current, runs: [run, ...current.runs] }));
            }}
          />
        )}

        {section === "models" && selectedVersion && (
          <ModelsWorkflow
            state={state}
            selectedVersion={selectedVersion}
            selectedVersionId={selectedVersionId}
            setSelectedVersionId={setSelectedVersionId}
            setState={setState}
          />
        )}

        {section === "storage" && (
          <StorageWorkflow
            state={state}
            storageUsed={storageUsed}
            storagePercent={storagePercent}
            storageOverQuota={storageOverQuota}
            setState={setState}
          />
        )}
      </section>
    </main>
  );
}

function LoginScreen({ onLogin, error }: { onLogin: (email: string, password: string) => void; error: string }) {
  const [email, setEmail] = useState(demoAdmin.email);
  const [password, setPassword] = useState(demoAdmin.password);

  return (
    <main className="login-shell">
      <form
        className="login-panel"
        onSubmit={(event) => {
          event.preventDefault();
          onLogin(email, password);
        }}
      >
        <div className="brand large">
          <div className="brand-mark">AS</div>
          <div>
            <strong>Advance Seeds</strong>
            <span>Model Registry</span>
          </div>
        </div>
        <div>
          <h1>Admin console</h1>
          <p>Use the pre-created demo admin role to manage training, deployment, and storage.</p>
        </div>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" type="submit">
          <ShieldCheck size={18} />
          Log in as admin
        </button>
      </form>
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
  onOpenStorage,
}: {
  production?: RegistryVersion;
  staging?: RegistryVersion;
  runs: RegistryRun[];
  storageUsed: number;
  quota: number;
  storagePercent: number;
  storageOverQuota: boolean;
  onOpenTrain: () => void;
  onOpenStorage: () => void;
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
            <Step number="1" title="Train" text="Define classes and hyperparameters, then create a Colab MCP run." />
            <Step number="2" title="Track" text="Watch progress, logs, and metrics update while the job runs." />
            <Step number="3" title="Deploy" text="Promote a validated model to staging or production." />
            <Step number="4" title="Clean" text="Watch R2 usage and delete inactive artifacts before quota is exceeded." />
          </div>
          <button className="primary-button" type="button" onClick={onOpenTrain}>
            <Wand2 size={18} />
            Start training
          </button>
        </section>
        <section className="panel">
          <SectionHeading title="Live runs" text="Reported by the Python SDK; Colab MCP context is preserved per run." />
          <RunList runs={runs.slice(0, 4)} />
          <button className={storageOverQuota ? "danger-button" : "ghost-button"} type="button" onClick={onOpenStorage}>
            <Database size={18} />
            Review storage
          </button>
        </section>
      </section>
    </>
  );
}

function TrainWorkflow({
  config,
  setConfig,
  runs,
  onStart,
}: {
  config: TrainConfig;
  setConfig: (config: TrainConfig) => void;
  runs: RegistryRun[];
  onStart: () => void;
}) {
  const latest = runs[0];
  return (
    <section className="content-grid wide-left">
      <form
        className="panel train-form"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onStart();
        }}
      >
        <SectionHeading title="Train new model" text="Defaults are loaded from the current PoC config. Adjust only what the demo needs." />
        <label>
          Dataset config
          <input value={config.dataset} onChange={(event) => setConfig({ ...config, dataset: event.target.value })} />
        </label>
        <label>
          Source weights
          <input value={config.sourceWeights} onChange={(event) => setConfig({ ...config, sourceWeights: event.target.value })} />
        </label>
        <label>
          Classes
          <textarea
            value={config.classes.join("\n")}
            onChange={(event) => setConfig({ ...config, classes: splitLines(event.target.value) })}
            rows={6}
          />
        </label>
        <div className="form-grid">
          <NumberField label="Epochs" value={config.hyperParameters.epochs} onChange={(value) => updateHp(config, setConfig, "epochs", value)} />
          <NumberField label="Image size" value={config.hyperParameters.imgsz} onChange={(value) => updateHp(config, setConfig, "imgsz", value)} />
          <NumberField label="Patience" value={config.hyperParameters.patience} onChange={(value) => updateHp(config, setConfig, "patience", value)} />
          <NumberField label="LR0" value={config.hyperParameters.lr0} step="0.0001" onChange={(value) => updateHp(config, setConfig, "lr0", value)} />
          <NumberField label="Mosaic" value={config.hyperParameters.mosaic} step="0.1" onChange={(value) => updateHp(config, setConfig, "mosaic", value)} />
          <NumberField label="Mixup" value={config.hyperParameters.mixup} step="0.1" onChange={(value) => updateHp(config, setConfig, "mixup", value)} />
        </div>
        <label>
          Colab accelerator
          <select
            value={config.colabAccelerator}
            onChange={(event) => setConfig({ ...config, colabAccelerator: event.target.value as TrainConfig["colabAccelerator"] })}
          >
            <option value="T4">T4</option>
            <option value="L4">L4</option>
            <option value="A100">A100</option>
          </select>
        </label>
        <button className="primary-button" type="submit">
          <Rocket size={18} />
          Start Colab MCP training
        </button>
      </form>
      <section className="panel">
        <SectionHeading title="Live tracking" text="This demo simulates the metric stream that the SDK writes to Supabase." />
        {latest ? <RunDetail run={latest} /> : <p>No training runs yet.</p>}
      </section>
    </section>
  );
}

function ModelsWorkflow({
  state,
  selectedVersion,
  selectedVersionId,
  setSelectedVersionId,
  setState,
}: {
  state: RegistryState;
  selectedVersion: RegistryVersion;
  selectedVersionId: string;
  setSelectedVersionId: (id: string) => void;
  setState: React.Dispatch<React.SetStateAction<RegistryState>>;
}) {
  return (
    <section className="content-grid wide-right">
      <section className="panel">
        <SectionHeading title="Model versions" text="Select a model, then deploy or undeploy channels." />
        <div className="version-list">
          {state.versions.map((version) => (
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
        <ModelDetail version={selectedVersion} state={state} setState={setState} />
      </section>
    </section>
  );
}

function StorageWorkflow({
  state,
  storageUsed,
  storagePercent,
  storageOverQuota,
  setState,
}: {
  state: RegistryState;
  storageUsed: number;
  storagePercent: number;
  storageOverQuota: boolean;
  setState: React.Dispatch<React.SetStateAction<RegistryState>>;
}) {
  return (
    <section className="panel">
      <SectionHeading title="R2 storage" text="Monitor artifact usage and delete inactive models before storage exceeds quota." />
      <div className={storageOverQuota ? "quota-banner danger" : "quota-banner"}>
        <div>
          <strong>{storageUsed.toFixed(1)} MB used</strong>
          <span>
            {storagePercent}% of {state.quotaMb} MB demo quota
          </span>
        </div>
        {storageOverQuota && <span>Over quota. Delete inactive artifacts.</span>}
      </div>
      <div className="storage-bar">
        <div style={{ width: `${Math.min(storagePercent, 100)}%` }} />
      </div>
      <div className="storage-list">
        {state.storage.map((item) => {
          const version = state.versions.find((candidate) => candidate.id === item.versionId);
          return (
            <article className="storage-row" key={item.id}>
              <div>
                <strong>{version?.semver ?? item.versionId}</strong>
                <span>{item.key}</span>
              </div>
              <span>{item.sizeMb.toFixed(1)} MB</span>
              <span className={item.active ? "status-pill production" : "status-pill inactive"}>{item.active ? "active" : "inactive"}</span>
              <button className="danger-button compact" disabled={item.active} type="button" onClick={() => deleteArtifact(item.id, setState)}>
                <Trash2 size={16} />
                Delete
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
  state,
  setState,
}: {
  version: RegistryVersion;
  state: RegistryState;
  setState: React.Dispatch<React.SetStateAction<RegistryState>>;
}) {
  const run = state.runs.find((candidate) => candidate.id === version.runId);
  const channelNames = state.channels.filter((channel) => channel.versionId === version.id).map((channel) => channel.name);
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
        <button className="primary-button" type="button" onClick={() => deployVersion(version.id, "production", setState)}>
          Deploy production
        </button>
        <button className="ghost-button" type="button" onClick={() => deployVersion(version.id, "staging", setState)}>
          Deploy staging
        </button>
        {channelNames.map((name) => (
          <button className="danger-button" key={name} type="button" onClick={() => undeployChannel(name, setState)}>
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

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <article className="journey-step">
      <span>{number}</span>
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
}: {
  label: string;
  value: number;
  step?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function handleLogin(
  email: string,
  password: string,
  setState: React.Dispatch<React.SetStateAction<RegistryState>>,
  setLoginError: (message: string) => void,
) {
  if (email === demoAdmin.email && password === demoAdmin.password) {
    setState((current) => ({ ...current, adminEmail: email }));
    setLoginError("");
    return;
  }
  setLoginError("Invalid demo admin credentials.");
}

function createTrainingRun(config: TrainConfig): RegistryRun {
  const now = new Date();
  const id = `run-${now.getTime()}`;
  return {
    id,
    name: `${config.dataset.split("/").pop()?.replace(".yaml", "") ?? "model"}-${now.getHours()}${now.getMinutes()}`,
    status: "running",
    modelLine: config.modelLine,
    dataset: config.dataset,
    hardware: `Colab ${config.colabAccelerator}`,
    startedAt: now.toISOString().slice(0, 16).replace("T", " "),
    finishedAt: null,
    progress: 4,
    map50: 0.35,
    maskMap: 0.31,
    config,
    colabNotebook: `Colab MCP / ${id}.ipynb`,
    logs: [
      `Runtime requested: ${config.colabAccelerator}`,
      "Notebook cells prepared through Colab MCP",
      "Training command queued",
    ],
  };
}

function advanceRunningJobs(state: RegistryState): RegistryState {
  let changed = false;
  const completedRuns: RegistryRun[] = [];
  const nextRuns = state.runs.map((run) => {
    if (run.status !== "running") return run;
    changed = true;
    const progress = Math.min(100, run.progress + 7);
    const map50 = Math.min(0.91, (run.map50 ?? 0.35) + 0.025);
    const maskMap = Math.min(0.84, (run.maskMap ?? 0.31) + 0.022);
    if (progress >= 100) {
      const completedRun = {
        ...run,
        progress,
        map50,
        maskMap,
        status: "succeeded" as const,
        finishedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
        logs: [...run.logs, "Epochs complete", "Artifact uploaded through signed R2 URL"],
      };
      completedRuns.push(completedRun);
      return completedRun;
    }
    return {
      ...run,
      progress,
      map50,
      maskMap,
      logs: [...run.logs.slice(-4), `Epoch progress ${progress}% / mAP50=${map50.toFixed(2)} mask=${maskMap.toFixed(2)}`],
    };
  });
  if (!changed) return state;
  if (completedRuns.length === 0) {
    return { ...state, runs: nextRuns };
  }
  const newVersions = completedRuns.map((run) => {
    const semver = `1.0.${state.versions.length + 1}-${run.id.slice(-4)}`;
    return {
      id: `version-${run.id}`,
      semver,
      runId: run.id,
      state: "candidate" as const,
      sourceWeights: run.config.sourceWeights,
      dataset: run.config.dataset,
      classes: run.config.classes,
      hyperParameters: run.config.hyperParameters,
      map50: run.map50 ?? 0,
      maskMap: run.maskMap ?? 0,
      sizeMb: 12.2,
      contentHash: `sha256:${run.id.slice(-8)}...`,
      compatSignature: "0256a143...a5f1a28d1",
      createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    };
  });
  return {
    ...state,
    runs: nextRuns,
    versions: [...newVersions, ...state.versions],
    storage: [
      ...newVersions.map((version) => ({
        id: `artifact-${version.id}`,
        versionId: version.id,
        key: `runs/${version.runId}/${version.semver}.tflite`,
        kind: "tflite" as const,
        sizeMb: version.sizeMb,
        active: false,
      })),
      ...state.storage,
    ],
  };
}

function deployVersion(
  versionId: string,
  channelName: ChannelName,
  setState: React.Dispatch<React.SetStateAction<RegistryState>>,
) {
  setState((current) => ({
    ...current,
    channels: current.channels.map((channel) =>
      channel.name === channelName
        ? { ...channel, versionId, updatedAt: new Date().toISOString().slice(0, 16).replace("T", " "), updatedBy: "demo-admin" }
        : channel,
    ),
    versions: current.versions.map((version) => ({
      ...version,
      state: version.id === versionId ? channelName : version.state === channelName ? "candidate" : version.state,
    })),
    storage: current.storage.map((item) => (item.versionId === versionId ? { ...item, active: true } : item)),
  }));
}

function undeployChannel(channelName: ChannelName, setState: React.Dispatch<React.SetStateAction<RegistryState>>) {
  setState((current) => {
    const oldVersionId = current.channels.find((channel) => channel.name === channelName)?.versionId;
    return {
      ...current,
      channels: current.channels.map((channel) =>
        channel.name === channelName
          ? { ...channel, versionId: null, updatedAt: new Date().toISOString().slice(0, 16).replace("T", " "), updatedBy: "demo-admin" }
          : channel,
      ),
      versions: current.versions.map((version) =>
        version.id === oldVersionId ? { ...version, state: version.state === channelName ? "candidate" : version.state } : version,
      ),
    };
  });
}

function deleteArtifact(id: string, setState: React.Dispatch<React.SetStateAction<RegistryState>>) {
  setState((current) => ({ ...current, storage: current.storage.filter((item) => item.id !== id) }));
}

function resolveChannel(state: RegistryState, name: ChannelName) {
  const versionId = state.channels.find((channel) => channel.name === name)?.versionId;
  return state.versions.find((version) => version.id === versionId);
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
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
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
