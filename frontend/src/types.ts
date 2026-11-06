export type Phase = 1 | 2 | 3;
export const PHASES: Phase[] = [1, 2, 3];
export const COLORS: Record<Phase, string> = {
  1: "#0064c8",
  2: "#193e78",
  3: "#00758b",
};

export interface PhaseReading {
  voltage_kv: number;
  sensor_mv: number;
  adc_count: number;
}

export interface Telemetry {
  timestamp: string;
  source: "simulation" | "sensor";
  phase: Phase;
  reading: PhaseReading;
  drone: {
    altitude_m: number;
    battery_pct: number;
    distance_m: number;
    speed_ms: number;
  };
}

export interface Thresholds {
  nominal: number;
  tolerance: number;
  clearance: number;
  battery: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  nominal: 69,
  tolerance: 5,
  clearance: 5,
  battery: 25,
};

export function formatTime(timestamp: string, seconds = false) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
    hour12: false,
  });
}
