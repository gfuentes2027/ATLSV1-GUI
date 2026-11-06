import { ArrowDownToLine } from "lucide-react";
import { samplesInLastMinute } from "./telemetryData";
import { COLORS, formatTime } from "./types";
import type { Telemetry } from "./types";

export default function TelemetryLog({
  samples,
  now,
  isDemo,
  onExport,
}: {
  samples: Telemetry[];
  now: number;
  isDemo: boolean;
  onExport: () => void;
}) {
  const recent = samplesInLastMinute(samples, now);
  return (
    <section className="panel log-panel">
      <div className="panel-heading">
        <div>
          <h2>
            Measurement stream
            <span className="count-badge">{recent.length}</span>
          </h2>
          <p>All readings from the past minute, newest first.</p>
        </div>
        <span className="count-badge">Last 60 seconds</span>
      </div>
      <div className="table-scroll">
        <table className="log-table">
          <thead>
            <tr>
              <th>LOCAL TIME</th>
              <th>PHASE</th>
              <th>VOLTAGE / kV</th>
              <th>RAW SENSOR / mV</th>
              <th>ALTITUDE / m</th>
              <th>BATTERY / %</th>
              <th>DISTANCE FROM LINE / m</th>
              <th>SOURCE</th>
            </tr>
          </thead>
          <tbody>
            {[...recent].reverse().map((sample) => (
              <tr key={sample.timestamp}>
                <td title={sample.timestamp}>
                  {formatTime(sample.timestamp, true)}
                </td>
                <td style={{ color: COLORS[sample.phase] }}>{sample.phase}</td>
                <td>{sample.reading.voltage_kv.toFixed(3)}</td>
                <td>{sample.reading.sensor_mv.toFixed(2)}</td>
                <td>{sample.drone.altitude_m.toFixed(2)}</td>
                <td>{sample.drone.battery_pct.toFixed(1)}</td>
                <td>{sample.drone.distance_m.toFixed(2)}</td>
                <td>
                  <span className="table-source">
                    {isDemo ? "Local demo" : sample.source}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!recent.length && (
          <p className="empty-state">
            No measurements in the past minute. Waiting for fresh sensor
            readings.
          </p>
        )}
      </div>
      <div className="sensor-footer">
        <span>
          CSV export includes all {recent.length} samples from the past minute,
          including raw sensor values and ADC counts.
        </span>
        <button
          className="text-button"
          disabled={!recent.length}
          onClick={onExport}
        >
          Export CSV
          <ArrowDownToLine size={14} />
        </button>
      </div>
    </section>
  );
}
