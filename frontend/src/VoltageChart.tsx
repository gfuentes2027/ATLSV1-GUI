import { useState } from "react";
import { COLORS, formatTime } from "./types";
import { phaseSegments } from "./telemetryData";
import type { Phase, Telemetry, Thresholds } from "./types";

interface Props {
  samples: Telemetry[];
  visible: Phase[];
  thresholds: Thresholds;
  range: number;
  endTime: number;
}

export default function VoltageChart({
  samples,
  visible,
  thresholds,
  range,
  endTime,
}: Props) {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const width = 840,
    height = 260,
    left = 52,
    right = 18,
    top = 16,
    bottom = 36;
  const shown = samples.filter((sample) => visible.includes(sample.phase));
  const values = shown.map((sample) => sample.reading.voltage_kv);
  const spread = Math.max(thresholds.nominal * 0.035, 1);
  const min = Math.floor(Math.min(thresholds.nominal - spread, ...values));
  const max = Math.ceil(Math.max(thresholds.nominal + spread, ...values));
  const start = endTime - range * 1000;
  const x = (time: number) =>
    left + ((time - start) / (range * 1000)) * (width - left - right);
  const y = (v: number) =>
    top + ((max - v) / (max - min)) * (height - top - bottom);
  const hovered =
    hoverTime === null
      ? undefined
      : shown.reduce<Telemetry | undefined>(
          (closest, sample) =>
            !closest ||
            Math.abs(Date.parse(sample.timestamp) - hoverTime) <
              Math.abs(Date.parse(closest.timestamp) - hoverTime)
              ? sample
              : closest,
          undefined,
        );

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Sequential voltage measurements for phases ${visible.join(", ")} over the last ${range / 60} minutes. One phase is measured at a time; gaps indicate periods without measurements for that phase. Values in kilovolts.`}
        onPointerLeave={() => setHoverTime(null)}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio =
            (((event.clientX - rect.left) / rect.width) * width - left) /
            (width - left - right);
          setHoverTime(start + Math.max(0, Math.min(1, ratio)) * range * 1000);
        }}
      >
        <defs>
          <clipPath id="plot-clip">
            <rect
              x={left}
              y={top}
              width={width - left - right}
              height={height - top - bottom}
            />
          </clipPath>
        </defs>
        {Array.from({ length: 5 }, (_, i) => {
          const value = min + ((max - min) * i) / 4;
          return (
            <g key={i}>
              <line
                x1={left}
                x2={width - right}
                y1={y(value)}
                y2={y(value)}
                stroke="#edf0eb"
              />
              <text
                x={left - 13}
                y={y(value) + 4}
                textAnchor="end"
                className="axis-label"
              >
                {value.toFixed(1)}
              </text>
            </g>
          );
        })}
        {Array.from({ length: 6 }, (_, i) => {
          const time = start + (range * 1000 * i) / 5;
          return (
            <text
              key={i}
              x={x(time)}
              y={height - 8}
              textAnchor="middle"
              className="axis-label"
            >
              {formatTime(new Date(time).toISOString(), range === 60)}
            </text>
          );
        })}
        <g clipPath="url(#plot-clip)">
          <line
            x1={left}
            x2={width - right}
            y1={y(thresholds.nominal)}
            y2={y(thresholds.nominal)}
            stroke="#aeb8ae"
            strokeDasharray="4 5"
          />
          {visible.flatMap((phase) =>
            phaseSegments(samples, phase).map((segment, index) =>
              segment.length === 1 ? (
                <circle
                  key={`${phase}-${index}`}
                  data-phase={phase}
                  cx={x(Date.parse(segment[0].timestamp))}
                  cy={y(segment[0].reading.voltage_kv)}
                  r="3"
                  fill={COLORS[phase]}
                />
              ) : (
                <path
                  key={`${phase}-${index}`}
                  data-phase={phase}
                  d={segment
                    .map(
                      (sample, i) =>
                        `${i ? "L" : "M"} ${x(Date.parse(sample.timestamp)).toFixed(1)} ${y(sample.reading.voltage_kv).toFixed(1)}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke={COLORS[phase]}
                  strokeWidth="2.1"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ),
            ),
          )}
          {hovered && (
            <g>
              <line
                x1={x(Date.parse(hovered.timestamp))}
                x2={x(Date.parse(hovered.timestamp))}
                y1={top}
                y2={height - bottom}
                stroke="#b2bab2"
                strokeDasharray="3 3"
              />
              <circle
                cx={x(Date.parse(hovered.timestamp))}
                cy={y(hovered.reading.voltage_kv)}
                r="4"
                fill={COLORS[hovered.phase]}
                stroke="white"
                strokeWidth="2"
              />
            </g>
          )}
        </g>
      </svg>
      {!shown.length && (
        <div className="chart-empty">
          No measurements for the selected phases
        </div>
      )}
      {hovered && (
        <div className="chart-tooltip">
          <strong>{formatTime(hovered.timestamp, true)}</strong>
          <span>
            <i style={{ background: COLORS[hovered.phase] }} />
            Phase {hovered.phase}{" "}
            <b>{hovered.reading.voltage_kv.toFixed(2)} kV</b>
          </span>
        </div>
      )}
    </div>
  );
}
