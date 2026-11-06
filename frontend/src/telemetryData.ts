import { PHASES } from "./types";
import type { Phase, Telemetry } from "./types";

export function isTelemetry(value: unknown): value is Telemetry {
  if (!value || typeof value !== "object") return false;
  const sample = value as Telemetry;
  return (
    typeof sample.timestamp === "string" &&
    Number.isFinite(Date.parse(sample.timestamp)) &&
    PHASES.includes(sample.phase) &&
    ["simulation", "sensor"].includes(sample.source) &&
    !!sample.reading &&
    !!sample.drone &&
    [
      sample.reading.voltage_kv,
      sample.reading.sensor_mv,
      sample.reading.adc_count,
      sample.drone.altitude_m,
      sample.drone.battery_pct,
      sample.drone.distance_m,
      sample.drone.speed_ms,
    ].every((value) => typeof value === "number" && Number.isFinite(value))
  );
}

export function samplesInLastMinute(
  samples: Telemetry[],
  now: number,
): Telemetry[] {
  return samples.filter((sample) => {
    const timestamp = Date.parse(sample.timestamp);
    return timestamp > now - 60_000 && timestamp <= now;
  });
}

export function peakForPhase(
  samples: Telemetry[],
  phase: Phase | undefined,
): Telemetry | undefined {
  return samples.reduce<Telemetry | undefined>((peak, sample) => {
    if (sample.phase !== phase) return peak;
    if (
      !peak ||
      sample.reading.voltage_kv > peak.reading.voltage_kv ||
      (sample.reading.voltage_kv === peak.reading.voltage_kv &&
        Date.parse(sample.timestamp) > Date.parse(peak.timestamp))
    )
      return sample;
    return peak;
  }, undefined);
}

// Start a new trace after another phase or a data gap; never interpolate unmeasured phases.
export function phaseSegments(
  samples: Telemetry[],
  phase: Phase,
): Telemetry[][] {
  const segments: Telemetry[][] = [];
  let run: Telemetry[] = [];
  for (const sample of samples) {
    const previous = run.at(-1);
    if (
      sample.phase !== phase ||
      (previous &&
        Date.parse(sample.timestamp) - Date.parse(previous.timestamp) > 5000)
    ) {
      if (run.length) segments.push(run);
      run = [];
    }
    if (sample.phase === phase) run.push(sample);
  }
  if (run.length) segments.push(run);
  return segments;
}

export function telemetryCsv(samples: Telemetry[]): string {
  const columns = [
    "timestamp",
    "source",
    "phase",
    "voltage_kv",
    "sensor_mv",
    "adc_count",
    "altitude_m",
    "battery_pct",
    "distance_m",
    "speed_ms",
  ];
  return [
    columns.join(","),
    ...samples.map((sample) =>
      [
        sample.timestamp,
        sample.source,
        sample.phase,
        sample.reading.voltage_kv,
        sample.reading.sensor_mv,
        sample.reading.adc_count,
        sample.drone.altitude_m,
        sample.drone.battery_pct,
        sample.drone.distance_m,
        sample.drone.speed_ms,
      ].join(","),
    ),
  ].join("\r\n");
}
