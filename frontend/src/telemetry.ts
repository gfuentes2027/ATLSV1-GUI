import { useEffect, useRef, useState } from "react";
import { isTelemetry } from "./telemetryData";
import type { Phase, Telemetry } from "./types";

function demoSample(time: number): Telemetry {
  const t = time / 1000;
  const phase = ((Math.floor(t / 20) % 3) + 1) as Phase;
  const index = phase - 1;
  const voltage =
    69 +
    [0.24, -0.32, 0.07][index] +
    0.65 * Math.sin(t / 19 + index * 1.8) +
    0.22 * Math.sin(t / 3.1 + index);
  const mv = (voltage / 100) * 2500;
  return {
    timestamp: new Date(time).toISOString(),
    source: "simulation",
    phase,
    reading: {
      voltage_kv: voltage,
      sensor_mv: mv,
      adc_count: Math.round((mv / 3300) * 4095),
    },
    drone: {
      altitude_m: 32.4 + 0.55 * Math.sin(t / 35),
      battery_pct: 78,
      distance_m: 8.6 + 0.35 * Math.sin(t / 28),
      speed_ms: 2.4,
    },
  };
}

function seedDemo() {
  const now = Date.now();
  return Array.from({ length: 901 }, (_, i) =>
    demoSample(now - (900 - i) * 1000),
  );
}

export function useTelemetry() {
  const [samples, setSamples] = useState<Telemetry[]>(seedDemo);
  const [connected, setConnected] = useState(false);
  const [hasConnected, setHasConnected] = useState(false);
  const [mode, setMode] = useState<"simulation" | "sensor">("simulation");
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("Connecting to telemetry service…");
  const connectedOnce = useRef(false);

  useEffect(() => {
    if (paused) return;
    let controller = new AbortController();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let needsHistory = true;
    async function poll() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const endpoint = needsHistory
          ? "/api/telemetry/history?seconds=900"
          : "/api/telemetry/latest";
        const response = await fetch(endpoint, { signal: controller.signal });
        if (response.status === 404) {
          if (!stopped) {
            setConnected(true);
            setHasConnected(true);
            connectedOnce.current = true;
            setSamples([]);
            setMode("sensor");
            setError("Waiting for the first sensor sample.");
          }
        } else {
          if (!response.ok)
            throw new Error(`Telemetry service returned ${response.status}`);
          const data = await response.json();
          if (stopped) return;
          if (needsHistory) {
            if (
              !Array.isArray(data.samples) ||
              !data.samples.every(isTelemetry) ||
              !["simulation", "sensor"].includes(data.mode)
            )
              throw new Error("Invalid telemetry response");
            setSamples(data.samples);
            setMode(data.mode);
            needsHistory = false;
            setError(
              data.samples.length ? "" : "Waiting for the first sensor sample.",
            );
          } else {
            const sample = data as Telemetry;
            if (!isTelemetry(sample))
              throw new Error("Invalid telemetry response");
            setSamples((previous) => {
              if (previous.at(-1)?.timestamp === sample.timestamp)
                return previous;
              return [...previous, sample].slice(-3600);
            });
            setMode(sample.source);
            setError("");
          }
          setConnected(true);
          setHasConnected(true);
          connectedOnce.current = true;
        }
      } catch (exception) {
        if (stopped) return;
        setConnected(false);
        needsHistory = true;
        setError(
          connectedOnce.current
            ? "Connection lost. Last received readings are retained; reconnecting…"
            : "Backend unavailable. Showing local demo data; retrying connection…",
        );
        if (!connectedOnce.current)
          setSamples((previous) => [
            ...previous.slice(-900),
            demoSample(Date.now()),
          ]);
      } finally {
        clearTimeout(timeout);
        if (!stopped) {
          setNow(Date.now());
          timer = setTimeout(poll, 1000);
        }
      }
    }
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [paused]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return {
    samples,
    latest: samples.at(-1),
    connected,
    hasConnected,
    mode,
    paused,
    setPaused,
    error,
    now,
  };
}
