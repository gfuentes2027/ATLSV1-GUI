import { Radio, TriangleAlert } from "lucide-react";
import { COLORS, formatTime } from "./types";
import type { Telemetry, Thresholds } from "./types";

export default function PeakReading({
  sample,
  thresholds,
}: {
  sample?: Telemetry;
  thresholds: Thresholds;
}) {
  const value = sample?.reading.voltage_kv;
  const deviation =
    value === undefined
      ? 0
      : ((value - thresholds.nominal) / thresholds.nominal) * 100;
  const inRange =
    value !== undefined &&
    value >= thresholds.nominal * (1 - thresholds.tolerance / 100) &&
    value <= thresholds.nominal * (1 + thresholds.tolerance / 100);
  const color = sample ? COLORS[sample.phase] : "var(--text-muted)";
  return (
    <section
      className="peak-reading phase-card"
      aria-label="Peak voltage measurement"
    >
      <div className="peak-reading-main">
        <div className="phase-label">
          <Radio size={16} />
          Peak phase voltage
        </div>
        <small className="peak-window">
          Highest stored measurement for this phase
        </small>
        <div className="peak-voltage">
          <strong>{value?.toFixed(2) ?? "—"}</strong>
          <span>kV</span>
        </div>
        <div className="peak-reading-status">
          <span
            className={
              value === undefined
                ? "muted-text"
                : inRange
                  ? "range-status"
                  : "out-of-range"
            }
          >
            {value === undefined ? (
              "Awaiting reading"
            ) : inRange ? (
              <>
                <span className="status-dot" />
                Within range
              </>
            ) : (
              <>
                <TriangleAlert size={12} />
                Out of range
              </>
            )}
          </span>
          <span className="deviation">
            {value === undefined
              ? "—"
              : `${deviation >= 0 ? "+" : ""}${deviation.toFixed(2)}%`}{" "}
            vs. nominal
          </span>
        </div>
      </div>
      <div className="peak-reading-detail">
        <span>Measured phase</span>
        <strong style={{ color }}>
          {sample ? `Phase ${sample.phase}` : "Awaiting phase"}
        </strong>
      </div>
      <div className="peak-reading-detail">
        <span>Peak recorded at</span>
        <strong>{sample ? formatTime(sample.timestamp, true) : "—"}</strong>
        <small>Local time</small>
      </div>
    </section>
  );
}
