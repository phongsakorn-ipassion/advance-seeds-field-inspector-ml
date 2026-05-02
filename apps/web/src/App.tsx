import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  GitBranch,
  History,
  Rocket,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { channels, RegistryRun, RegistryVersion, runs, versions } from "./registryData";

const statusLabels = {
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function App() {
  const bestVersion = versions[0];
  const activeRun = runs.find((run) => run.status === "running");

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
          <a className="active" href="#overview">
            <Activity size={18} />
            Overview
          </a>
          <a href="#versions">
            <GitBranch size={18} />
            Versions
          </a>
          <a href="#runs">
            <History size={18} />
            Runs
          </a>
          <a href="#channels">
            <Rocket size={18} />
            Channels
          </a>
        </nav>

        <div className="sidebar-footer">
          <ShieldCheck size={18} />
          <div>
            <strong>Admin writes only</strong>
            <span>Supabase RLS enforced</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Model rollout control</h1>
            <p>Promote validated YOLO26n segmentation artifacts to staging and production.</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button" type="button">
              <UploadCloud size={18} />
              Register artifact
            </button>
            <button className="primary-button" type="button">
              <Rocket size={18} />
              Promote selected
            </button>
          </div>
        </header>

        <section className="summary-grid" id="overview" aria-label="Registry summary">
          <MetricCard label="Best candidate" value={bestVersion.semver} detail={`${pct(bestVersion.maskMap)} mask mAP`} />
          <MetricCard label="Active training" value={activeRun?.name ?? "None"} detail={activeRun ? activeRun.hardware : "No run in progress"} />
          <MetricCard label="OTA compat" value="Matched" detail="0256a143...a5f1a28d1" />
          <MetricCard label="Production" value={channels[1].semver ?? "Unset"} detail="Current inspector channel" />
        </section>

        <section className="content-grid">
          <section className="panel channel-panel" id="channels">
            <div className="section-heading">
              <div>
                <h2>Channels</h2>
                <p>Named pointers that the inspector app resolves at launch.</p>
              </div>
            </div>
            <div className="channel-cards">
              {channels.map((channel) => (
                <article className="channel-card" key={channel.name}>
                  <div className="channel-title">
                    <CircleDot size={16} />
                    <h3>{channel.name}</h3>
                  </div>
                  <strong>{channel.semver ?? "Unset"}</strong>
                  <dl>
                    <div>
                      <dt>Updated</dt>
                      <dd>{channel.updatedAt}</dd>
                    </div>
                    <div>
                      <dt>By</dt>
                      <dd>{channel.updatedBy}</dd>
                    </div>
                    <div>
                      <dt>Compat</dt>
                      <dd>{channel.compatSignature ?? "None"}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section className="panel runs-panel" id="runs">
            <div className="section-heading">
              <div>
                <h2>Recent runs</h2>
                <p>Training lifecycle records reported by the Python SDK.</p>
              </div>
            </div>
            <div className="run-list">
              {runs.map((run) => (
                <RunRow run={run} key={run.id} />
              ))}
            </div>
          </section>
        </section>

        <section className="panel versions-panel" id="versions">
          <div className="section-heading">
            <div>
              <h2>Model versions</h2>
              <p>Compare candidates before promoting a channel pointer.</p>
            </div>
            <button className="ghost-button compact" type="button">
              Export CSV
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Dataset</th>
                  <th>mAP50</th>
                  <th>Mask mAP</th>
                  <th>Size</th>
                  <th>Hash</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => (
                  <VersionRow version={version} key={version.id} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
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
        <span>{statusLabels[run.status]}</span>
        <span>{run.map50 === null ? "mAP pending" : `${pct(run.map50)} mAP50`}</span>
        <span>{run.maskMap === null ? "mask pending" : `${pct(run.maskMap)} mask`}</span>
      </div>
    </article>
  );
}

function VersionRow({ version }: { version: RegistryVersion }) {
  return (
    <tr>
      <td>
        <div className="version-cell">
          <CheckCircle2 size={16} />
          <div>
            <strong>{version.semver}</strong>
            <span>{version.sourceWeights}</span>
          </div>
        </div>
      </td>
      <td>
        <span className={`status-pill ${version.status}`}>{version.status}</span>
      </td>
      <td>{version.dataset}</td>
      <td>{pct(version.map50)}</td>
      <td>{pct(version.maskMap)}</td>
      <td>{version.sizeMb.toFixed(1)} MB</td>
      <td>
        <code>{version.contentHash}</code>
      </td>
      <td>
        <button className="icon-button" type="button" aria-label={`Open ${version.semver}`}>
          <ArrowUpRight size={16} />
        </button>
      </td>
    </tr>
  );
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}
