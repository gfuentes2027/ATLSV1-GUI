import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Battery,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cpu,
  Gauge,
  LayoutDashboard,
  Maximize2,
  MoveUpRight,
  Pause,
  Play,
  Radio,
  RadioTower,
  Ruler,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  TriangleAlert,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { useTelemetry } from "./telemetry";
import { COLORS, DEFAULT_THRESHOLDS, formatTime } from "./types";
import type { Telemetry, Thresholds } from "./types";
import PeakReading from "./PeakReading";
import TelemetryLog from "./TelemetryLog";
import {
  peakForPhase,
  samplesInLastMinute,
  telemetryCsv,
} from "./telemetryData";

type View = "overview" | "log" | "mission";

function Drone({
  size = 24,
  strokeWidth = 2,
}: {
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
      <rect x="9" y="8" width="6" height="8" rx="2" />
      <circle cx="5" cy="5" r="3.5" />
      <circle cx="19" cy="5" r="3.5" />
      <circle cx="5" cy="19" r="3.5" />
      <circle cx="19" cy="19" r="3.5" />
    </svg>
  );
}

function readThresholds(): Thresholds {
  try {
    const saved = JSON.parse(localStorage.getItem("atls-thresholds") ?? "null");
    if (
      saved &&
      saved.nominal > 0 &&
      saved.nominal <= 1000 &&
      saved.tolerance > 0 &&
      saved.tolerance <= 50 &&
      saved.clearance > 0 &&
      saved.battery >= 0 &&
      saved.battery <= 100
    )
      return saved;
  } catch {
    /* Use defaults when browser storage is unavailable. */
  }
  return DEFAULT_THRESHOLDS;
}

function saveCsv(samples: Telemetry[]) {
  const url = URL.createObjectURL(
    new Blob([telemetryCsv(samples)], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `atls-telemetry-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FlightDiagram({
  altitude,
  distance,
}: {
  altitude?: number;
  distance?: number;
}) {
  return (
    <svg
      viewBox="0 0 400 195"
      className="flight-diagram"
      role="img"
      aria-label={`Schematic, not to scale. Drone altitude ${altitude?.toFixed(1) ?? "unknown"} meters. Transmission line distance ${distance?.toFixed(1) ?? "unknown"} meters.`}
    >
      <defs>
        <pattern
          id="diagram-grid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r=".7" fill="var(--diagram-grid)" />
        </pattern>
      </defs>
      <rect width="400" height="195" fill="url(#diagram-grid)" />
      <path d="M0 174H400" stroke="var(--diagram-ground)" />
      <path
        d="m65 175 25-138 26 138M74 126h33M79 95h23M84 65h13M76 126l32 29m-5-60L74 126m28-31L83 65m24 61L78 154M55 55h69M44 70h91M66 41h48"
        fill="none"
        stroke="var(--diagram-tower)"
        strokeWidth="2"
      />
      <path
        d="M44 70c90 22 163 22 229 0M55 55c95 18 160 18 229 0M66 41c89 15 154 15 229 0"
        fill="none"
        stroke="var(--diagram-wire)"
        strokeWidth="1.5"
      />
      <path
        d="M285 105V174M279 110l6-5 6 5m-12 59 6 5 6-5"
        stroke="var(--diagram-dimension)"
        fill="none"
        strokeDasharray="3 3"
      />
      <text x="295" y="143" fill="var(--text-secondary)" fontSize="11">
        {altitude?.toFixed(1) ?? "—"} m AGL
      </text>
      <path
        d="M209 82l49 19"
        stroke="var(--brand-blue)"
        strokeDasharray="4 4"
      />
      <rect
        x="195"
        y="105"
        width="61"
        height="22"
        rx="6"
        fill="var(--brand-ice)"
      />
      <text
        x="225"
        y="120"
        textAnchor="middle"
        fill="var(--brand-blue-strong)"
        fontSize="11"
        fontWeight="600"
      >
        {distance?.toFixed(1) ?? "—"} m
      </text>
      <g
        transform="translate(278 91)"
        stroke="var(--brand-navy)"
        strokeWidth="2"
        fill="none"
      >
        <path d="m-14-10 28 20m0-20L-14 10" />
        <rect x="-5" y="-7" width="10" height="14" rx="3" fill="#cae5ff" />
        <ellipse cx="-17" cy="-12" rx="12" ry="4" />
        <ellipse cx="17" cy="-12" rx="12" ry="4" />
        <ellipse cx="-17" cy="12" rx="12" ry="4" />
        <ellipse cx="17" cy="12" rx="12" ry="4" />
      </g>
      <text
        x="20"
        y="191"
        fill="var(--text-muted)"
        fontSize="9"
        letterSpacing="1"
      >
        FLIGHT GEOMETRY · SCHEMATIC / NOT TO SCALE
      </text>
    </svg>
  );
}

function SettingsDialog({
  thresholds,
  onSave,
  onClose,
}: {
  thresholds: Thresholds;
  onSave: (value: Thresholds) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="settings-dialog"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          onSave({
            nominal: Number(form.get("nominal")),
            tolerance: Number(form.get("tolerance")),
            clearance: Number(form.get("clearance")),
            battery: Number(form.get("battery")),
          });
          ref.current?.close();
        }}
      >
        <div className="panel-heading">
          <div>
            <span className="eyebrow">MONITORING PREFERENCES</span>
            <h2>Alert thresholds</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close settings"
            onClick={() => ref.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <p>
          Set the reference values used by this dashboard. Confirm these values
          for your transmission line before monitoring real equipment.
        </p>
        <label>
          Nominal phase voltage <span>kV</span>
          <input
            name="nominal"
            type="number"
            min="0.1"
            max="1000"
            step="0.1"
            defaultValue={thresholds.nominal}
            required
          />
        </label>
        <label>
          Voltage tolerance <span>± %</span>
          <input
            name="tolerance"
            type="number"
            min="0.1"
            max="50"
            step="0.1"
            defaultValue={thresholds.tolerance}
            required
          />
        </label>
        <label>
          Minimum line clearance <span>m</span>
          <input
            name="clearance"
            type="number"
            min="0.1"
            max="10000"
            step="0.1"
            defaultValue={thresholds.clearance}
            required
          />
        </label>
        <label>
          Low battery alert <span>%</span>
          <input
            name="battery"
            type="number"
            min="0"
            max="100"
            defaultValue={thresholds.battery}
            required
          />
        </label>
        <button className="button primary" type="submit">
          <Check size={16} />
          Save preferences
        </button>
      </form>
    </dialog>
  );
}

export default function App() {
  const {
    samples,
    latest,
    connected,
    hasConnected,
    mode,
    paused,
    setPaused,
    error,
    now,
  } = useTelemetry();
  const [view, setView] = useState<View>("overview");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [thresholds, setThresholds] = useState<Thresholds>(readThresholds);
  const [exported, setExported] = useState(false);
  const endTime = latest ? new Date(latest.timestamp).getTime() : now;
  const overviewExportSamples = samples.filter(
    (sample) => Date.parse(sample.timestamp) >= endTime - 300_000,
  );
  const logSamples = samplesInLastMinute(samples, now);
  const exportSamples = view === "log" ? logSamples : overviewExportSamples;
  const phasePeak = peakForPhase(samples, latest?.phase);
  const stale =
    hasConnected &&
    !!latest &&
    now - new Date(latest.timestamp).getTime() > 5000;
  const fresh = connected && !stale && !paused && !!latest;
  const isDemo = !hasConnected;
  const sourceLabel = isDemo
    ? "Offline demo"
    : mode === "simulation"
      ? "Simulation"
      : "Sensor feed";
  const lower = thresholds.nominal * (1 - thresholds.tolerance / 100);
  const upper = thresholds.nominal * (1 + thresholds.tolerance / 100);
  const alerts = latest
    ? [
        ...(latest.reading.voltage_kv < lower ||
        latest.reading.voltage_kv > upper
          ? [`Phase ${latest.phase} voltage outside configured range`]
          : []),
        ...(latest.drone.distance_m < thresholds.clearance
          ? ["Line clearance below configured minimum"]
          : []),
        ...(latest.drone.battery_pct <= thresholds.battery
          ? ["Drone battery below configured threshold"]
          : []),
      ]
    : [];
  const exportData = () => {
    saveCsv(exportSamples);
    setExported(true);
    setTimeout(() => setExported(false), 2500);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("overview");
          }}
          aria-label="E-Field Dynamics — ATLS overview"
        >
          <span className="brand-logo-frame">
            <img
              className="brand-logo"
              src="/branding/e-field-dynamics-logo.png"
              alt="E-Field Dynamics"
              width="307"
              height="205"
            />
          </span>
          <span className="brand-caption">
            ATLS GROUND CONTROL<span className="version">V1</span>
          </span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={view === "overview" ? "nav-item active" : "nav-item"}
            onClick={() => setView("overview")}
          >
            <LayoutDashboard size={18} />
            Overview
            <span className="nav-dot" />
          </button>
          <button
            className={view === "log" ? "nav-item active" : "nav-item"}
            onClick={() => setView("log")}
          >
            <Activity size={18} />
            Telemetry log
          </button>
          <button
            className={view === "mission" ? "nav-item active" : "nav-item"}
            onClick={() => setView("mission")}
          >
            <RadioTower size={18} />
            Mission details
          </button>
        </nav>
        <div className="sidebar-line" />
        <span className="workspace-label">PREFERENCES</span>
        <button className="nav-item" onClick={() => setSettingsOpen(true)}>
          <SlidersHorizontal size={18} />
          Monitoring settings
        </button>
        <div className="sidebar-bottom">
          <div className="uav-mark">
            <Drone size={31} strokeWidth={1.2} />
          </div>
          <div className="sidebar-tag">TRANSMISSION INTELLIGENCE</div>
          <h3>
            A clearer view.
            <br />A safer inspection.
          </h3>
          <p>
            One sensor. Three phases.
            <br />
            One connected workspace.
          </p>
          <div className="sidebar-device">
            <span className={`status-dot ${fresh ? "" : "muted"}`} />
            <div>
              ATLS telemetry
              <span>
                {paused
                  ? "Display paused"
                  : connected
                    ? mode === "simulation"
                      ? "Simulator connected"
                      : "Sensor API connected"
                    : "API disconnected"}
              </span>
            </div>
            <Radio size={17} />
          </div>
        </div>
        <div className="sidebar-footer">
          <span>E-FIELD DYNAMICS</span>
          <span>01 / UAV</span>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {view === "overview"
                ? "Overview"
                : view === "log"
                  ? "Telemetry log"
                  : "Mission details"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="topbar-clock">
              <Clock3 size={14} />
              {formatTime(new Date(now).toISOString(), true)}
              <span>LOCAL</span>
            </span>
            <span className={`source-badge ${isDemo ? "demo" : ""}`}>
              <span className="status-dot" />
              {sourceLabel}
            </span>
            <button
              className="icon-button"
              aria-label="Monitoring settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 size={18} />
            </button>
            <span className="avatar" title="E-Field Dynamics ground station">
              EF
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">UAV TRANSMISSION-LINE MONITORING</div>
              <h1>
                {view === "overview"
                  ? "Transmission overview"
                  : view === "log"
                    ? "Telemetry log"
                    : "Mission details"}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {view === "overview"
                  ? "A real-time perspective on your power lines."
                  : view === "log"
                    ? "Every reading, timestamped and ready for analysis."
                    : "Your monitoring session and data connection at a glance."}
              </p>
            </div>
            <div className="page-actions">
              <button className="button" onClick={() => setPaused(!paused)}>
                {paused ? <Play size={15} /> : <Pause size={15} />}
                {paused ? "Resume feed" : "Pause feed"}
              </button>
              <button
                className="button primary"
                onClick={exportData}
                disabled={!exportSamples.length}
              >
                {exported ? <Check size={16} /> : <ArrowDownToLine size={16} />}
                {exported ? "Exported" : "Export data"}
              </button>
            </div>
          </div>

          <div className="session-strip">
            <div className="session-title">
              <RadioTower size={19} />
              <strong>Transmission corridor</strong>
              <span className="session-id">SESSION 001</span>
            </div>
            <div className="session-meta">
              <span>
                <i className="tiny-square" />
                Three-phase AC
              </span>
              <span>{thresholds.nominal} kV nominal</span>
              <span>
                <span className={`status-dot ${fresh ? "" : "muted"}`} />
                {paused
                  ? "Feed paused"
                  : stale
                    ? "Stale readings"
                    : fresh
                      ? "Receiving telemetry"
                      : "Awaiting connection"}
              </span>
            </div>
          </div>

          {(error || paused || stale) && (
            <div
              className={`notice ${(hasConnected && !connected) || stale ? "warning" : ""}`}
              role="status"
            >
              {paused ? (
                <Pause size={14} />
              ) : !connected ? (
                <WifiOff size={14} />
              ) : (
                <Radio size={14} />
              )}
              <span>
                {paused
                  ? "Display paused. Resume to retrieve the latest telemetry."
                  : stale
                    ? `Readings are stale. Last sample: ${latest ? formatTime(latest.timestamp, true) : "unknown"}. ${!connected ? "Reconnecting to backend…" : "Waiting for fresh sensor data."}`
                    : error}
              </span>
              {isDemo && <span className="notice-label">SIMULATED DATA</span>}
            </div>
          )}
          {!!alerts.length && (
            <div className="notice warning" role="alert">
              <TriangleAlert size={16} />
              <span>{alerts.join(" · ")}</span>
              <button
                className="text-button"
                onClick={() => setSettingsOpen(true)}
              >
                Review thresholds
                <ArrowRight size={13} />
              </button>
            </div>
          )}

          {view === "overview" && (
            <>
              <PeakReading sample={phasePeak} thresholds={thresholds} />

              <div className="dashboard-grid overview-grid">
                <section className="panel flight-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Flight telemetry</h2>
                      <p>Your UAV, at a glance</p>
                    </div>
                    <span className="round-icon">
                      <Drone size={20} />
                    </span>
                  </div>
                  <div className="flight-metric">
                    <span className="metric-icon">
                      <MoveUpRight size={21} />
                    </span>
                    <div>
                      <span className="metric-label">Drone altitude</span>
                      <div className="metric-number">
                        {latest?.drone.altitude_m.toFixed(1) ?? "—"}{" "}
                        <small>m</small>
                      </div>
                    </div>
                    <span className="metric-note">Above ground</span>
                  </div>
                  <div className="flight-metric battery-metric">
                    <span className="metric-icon">
                      <Battery size={21} />
                    </span>
                    <div>
                      <span className="metric-label">Drone battery</span>
                      <div
                        className={`metric-number ${latest && latest.drone.battery_pct <= thresholds.battery ? "out-of-range" : ""}`}
                      >
                        {latest?.drone.battery_pct.toFixed(0) ?? "—"}
                        <small>%</small>
                      </div>
                    </div>
                    <div
                      className="battery-bars"
                      aria-label={`Battery ${latest?.drone.battery_pct.toFixed(0) ?? "unknown"} percent`}
                    >
                      {Array.from({ length: 10 }, (_, i) => (
                        <i
                          key={i}
                          className={
                            latest &&
                            i < Math.ceil(latest.drone.battery_pct / 10)
                              ? "filled"
                              : ""
                          }
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flight-metric">
                    <span className="metric-icon">
                      <Ruler size={20} />
                    </span>
                    <div>
                      <span className="metric-label">Distance to line</span>
                      <div className="metric-number">
                        {latest?.drone.distance_m.toFixed(1) ?? "—"}{" "}
                        <small>m</small>
                      </div>
                    </div>
                    <span
                      className={`clearance-pill ${latest && latest.drone.distance_m < thresholds.clearance ? "danger" : ""}`}
                    >
                      {latest
                        ? latest.drone.distance_m >= thresholds.clearance
                          ? "Above minimum"
                          : "Below minimum"
                        : "No reading"}
                    </span>
                  </div>
                  <div className="flight-footer">
                    <Gauge size={15} />
                    <span>Ground speed</span>
                    <strong>
                      {latest?.drone.speed_ms.toFixed(1) ?? "—"}{" "}
                      <span>m/s</span>
                    </strong>
                  </div>
                </section>

                <section className="panel sensor-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Raw sensor measurements</h2>
                      <p>Unprocessed input from the sensing payload</p>
                    </div>
                    <span className="subtle-icon">
                      <Cpu size={21} />
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table className="sensor-table">
                      <thead>
                        <tr>
                          <th>MEASURED PHASE</th>
                          <th>SENSOR OUTPUT</th>
                          <th>ADC VALUE</th>
                          <th>LINE VOLTAGE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {latest ? (
                          <tr>
                            <td>
                              <span
                                className="channel-dot"
                                style={{ background: COLORS[latest.phase] }}
                              />
                              Phase {latest.phase}
                            </td>
                            <td>
                              {latest.reading.sensor_mv.toFixed(2)}{" "}
                              <span>mV</span>
                            </td>
                            <td>
                              {latest.reading.adc_count} <span>/ 4095</span>
                            </td>
                            <td>
                              {latest.reading.voltage_kv.toFixed(2)}{" "}
                              <span>kV</span>
                            </td>
                          </tr>
                        ) : (
                          <tr>
                            <td colSpan={4}>
                              Waiting for a sensor measurement
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="sensor-footer">
                    <span>
                      <span className="status-dot" />
                      12-bit ADC <span className="dot-separator">·</span> 3.3 V
                      reference
                    </span>
                    <button
                      className="text-button"
                      onClick={() => setView("log")}
                    >
                      View telemetry log
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                </section>

                <section className="panel geometry-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Spatial overview</h2>
                      <p>Position relative to the transmission line</p>
                    </div>
                    <Maximize2 size={16} className="subtle-icon" />
                  </div>
                  <FlightDiagram
                    altitude={latest?.drone.altitude_m}
                    distance={latest?.drone.distance_m}
                  />
                  <div className="geometry-footer">
                    <ShieldCheck size={15} />
                    <span>
                      Configured clearance{" "}
                      <strong>≥ {thresholds.clearance.toFixed(1)} m</strong>
                    </span>
                    <button
                      className="icon-button"
                      aria-label="Configure minimum clearance"
                      onClick={() => setSettingsOpen(true)}
                    >
                      <Settings2 size={14} />
                    </button>
                  </div>
                </section>
              </div>

              <div className="system-summary">
                <div>
                  <ShieldCheck size={16} />
                  <strong>
                    {latest
                      ? alerts.length
                        ? `${alerts.length} threshold alert${alerts.length > 1 ? "s" : ""}`
                        : "Latest sample within configured thresholds"
                      : "Waiting for measurements"}
                  </strong>
                  <span>
                    {isDemo || mode === "simulation"
                      ? "Simulation reference values"
                      : stale || !connected || paused
                        ? "Based on last received sample"
                        : "Based on current sensor data"}
                  </span>
                </div>
                <span>
                  Measured phase <strong>{latest ? latest.phase : "—"}</strong>
                </span>
              </div>
            </>
          )}

          {view === "log" && (
            <TelemetryLog
              samples={samples}
              now={now}
              isDemo={isDemo}
              onExport={exportData}
            />
          )}

          {view === "mission" && (
            <div className="mission-grid">
              <section className="panel mission-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Monitoring configuration</h2>
                    <p>ATLS V1 · UAV transmission-line inspection</p>
                  </div>
                  <RadioTower size={24} />
                </div>
                <dl>
                  <div>
                    <dt>Data source</dt>
                    <dd>{sourceLabel}</dd>
                  </div>
                  <div>
                    <dt>Backend connection</dt>
                    <dd>{connected ? "Connected" : "Disconnected"}</dd>
                  </div>
                  <div>
                    <dt>Nominal phase voltage</dt>
                    <dd>{thresholds.nominal} kV</dd>
                  </div>
                  <div>
                    <dt>Configured voltage range</dt>
                    <dd>
                      {lower.toFixed(2)}–{upper.toFixed(2)} kV
                    </dd>
                  </div>
                  <div>
                    <dt>Minimum line clearance</dt>
                    <dd>{thresholds.clearance} m</dd>
                  </div>
                  <div>
                    <dt>Battery alert threshold</dt>
                    <dd>{thresholds.battery}%</dd>
                  </div>
                  <div>
                    <dt>Last sample received</dt>
                    <dd>
                      {latest
                        ? formatTime(latest.timestamp, true)
                        : "Awaiting sample"}
                    </dd>
                  </div>
                  <div>
                    <dt>Data retention</dt>
                    <dd>Up to 3,600 samples in backend memory</dd>
                  </div>
                </dl>
                <button
                  className="button"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings2 size={15} />
                  Edit monitoring settings
                </button>
              </section>
              <section className="panel integration-panel">
                <Terminal size={24} />
                <h2>Connect your sensing payload</h2>
                <p>
                  The dashboard reads telemetry from the FastAPI service. To
                  ingest real measurements, start the backend with{" "}
                  <code>ATLS_SIMULATION=false</code>, then POST timestamped
                  readings to:
                </p>
                <code className="endpoint">POST /api/telemetry</code>
                <p>
                  Send the measured phase number (1, 2, or 3), its voltage and
                  raw sensor reading, and the UAV altitude, battery, ground
                  speed, and distance to line. Use the API docs to inspect the
                  complete schema.
                </p>
                <a
                  className="button"
                  href="http://127.0.0.1:8000/docs"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open local API documentation
                  <ArrowUpRight size={15} />
                </a>
                <div className="integration-note">
                  <CircleHelp size={16} />
                  <span>
                    Example voltages and alert thresholds are configurable
                    reference values. The spatial view is a schematic, not GPS
                    navigation.
                  </span>
                </div>
              </section>
            </div>
          )}

          <footer className="page-footer">
            <span>
              <Zap size={12} />
              E-Field Dynamics <span className="dot-separator">/</span> ATLS
              Ground Control
            </span>
            <span>
              {paused ? (
                <Pause size={12} />
              ) : connected ? (
                <Wifi size={12} />
              ) : (
                <WifiOff size={12} />
              )}
              {paused
                ? "Updates paused"
                : connected
                  ? "API connected"
                  : "API offline"}
              <span className="dot-separator">·</span>v1.0
            </span>
          </footer>
        </main>
      </div>
      {settingsOpen && (
        <SettingsDialog
          thresholds={thresholds}
          onClose={() => setSettingsOpen(false)}
          onSave={(value) => {
            setThresholds(value);
            try {
              localStorage.setItem("atls-thresholds", JSON.stringify(value));
            } catch {
              /* Settings remain active for this session. */
            }
          }}
        />
      )}
    </div>
  );
}
