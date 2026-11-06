import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

let server, data, PeakReading, TelemetryLog, VoltageChart, App, thresholds;
const now = Date.parse("2026-11-05T20:00:00Z");
const sample = (age, phase = 1, voltage = 69.12) => ({
  timestamp: new Date(now - age * 1000).toISOString(),
  source: "sensor",
  phase,
  reading: { voltage_kv: voltage, sensor_mv: 1728 + age, adc_count: 2144 },
  drone: { altitude_m: 32.4, battery_pct: 78, distance_m: 8.6, speed_ms: 2.4 },
});
const render = (component, props) =>
  renderToString(createElement(component, props)).replace(/<!--.*?-->/g, "");

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configLoader: "native",
    server: { middlewareMode: true },
    appType: "custom",
  });
  data = await server.ssrLoadModule("/src/telemetryData.ts");
  ({ default: PeakReading } = await server.ssrLoadModule(
    "/src/PeakReading.tsx",
  ));
  ({ default: TelemetryLog } = await server.ssrLoadModule(
    "/src/TelemetryLog.tsx",
  ));
  ({ default: VoltageChart } = await server.ssrLoadModule(
    "/src/VoltageChart.tsx",
  ));
  ({ default: App } = await server.ssrLoadModule("/src/App.tsx"));
  ({ DEFAULT_THRESHOLDS: thresholds } =
    await server.ssrLoadModule("/src/types.ts"));
});
after(async () => {
  await server?.close();
});

test("accepts single-phase readings and rejects legacy or malformed telemetry", () => {
  for (const phase of [1, 2, 3])
    assert.equal(data.isTelemetry(sample(0, phase)), true);
  assert.equal(data.isTelemetry({ ...sample(0), phase: "A" }), false);
  assert.equal(data.isTelemetry({ ...sample(0), phase: 4 }), false);
  const legacy = sample(0);
  delete legacy.reading;
  legacy.phases = {};
  assert.equal(data.isTelemetry(legacy), false);
  assert.equal(
    data.isTelemetry({
      ...sample(0),
      reading: { ...sample(0).reading, sensor_mv: NaN },
    }),
    false,
  );
});

test("log window excludes expired and future samples and advances with the clock", () => {
  const samples = [sample(61), sample(60), sample(59), sample(0), sample(-1)];
  assert.deepEqual(data.samplesInLastMinute(samples, now), [
    samples[2],
    samples[3],
  ]);
  assert.deepEqual(
    data.samplesInLastMinute(samples.slice(0, 4), now + 60_000),
    [],
  );
});

test("renders all past-minute log rows with phase, voltage and corresponding raw sensor values", () => {
  const samples = Array.from({ length: 121 }, (_, i) =>
    sample(120 - i, (i % 3) + 1),
  );
  const html = render(TelemetryLog, {
    samples,
    now,
    isDemo: false,
    onExport() {},
  });
  assert.equal((html.match(/<tr>/g) ?? []).length, 61); // Header plus 60 readings, with no 50-row truncation.
  assert.ok(!html.includes(samples[60].timestamp)); // Exactly 60 seconds old is expired.
  assert.ok(html.includes(samples[61].timestamp));
  assert.ok(
    html.indexOf(samples.at(-1).timestamp) <
      html.indexOf(samples[61].timestamp),
  );
  assert.match(
    html,
    /<th>PHASE<\/th><th>VOLTAGE \/ kV<\/th><th>RAW SENSOR \/ mV<\/th>/,
  );
  assert.match(html, /69\.120<\/td><td>1728\.00/);
  assert.doesNotMatch(html, /PHASE [ABC] \/ kV/);
  const expired = render(TelemetryLog, {
    samples: [sample(61)],
    now,
    isDemo: false,
    onExport() {},
  });
  assert.match(expired, /No measurements in the past minute/);
  assert.match(expired, /disabled=""/);
});

test("phase peaks use all available history, preserve earlier highs, and follow the active phase", () => {
  const firstPeak = sample(90, 2, 73.25);
  const otherPhase = sample(30, 1, 90);
  const latest = sample(0, 2, 69);
  const samples = [firstPeak, otherPhase, latest];
  assert.equal(data.peakForPhase(samples, latest.phase), firstPeak);
  assert.equal(data.peakForPhase(samples, 1), otherPhase);
  assert.equal(data.peakForPhase(samples, 3), undefined);
  assert.equal(data.peakForPhase(samples, undefined), undefined);
  assert.equal(data.peakForPhase([], 2), undefined);
  assert.ok(!data.samplesInLastMinute(samples, now).includes(firstPeak));
  const higher = sample(-1, 2, 74);
  assert.equal(data.peakForPhase([...samples, higher], 2), higher);
  const repeatedPeak = sample(-2, 2, 74);
  assert.equal(
    data.peakForPhase([...samples, higher, repeatedPeak], 2),
    repeatedPeak,
  );
  assert.equal(data.peakForPhase([latest], 2), latest);
});

test("peak voltage card renders the peak and its timestamp for only the measured phase", () => {
  const html = render(PeakReading, { sample: sample(0, 2, 70.25), thresholds });
  assert.match(html, /70\.25/);
  assert.match(html, /Peak phase voltage/);
  assert.match(html, /Peak recorded at/);
  assert.doesNotMatch(html, /Current sensor voltage/);
  assert.match(html, /Phase 2/);
  assert.doesNotMatch(html, /Phase 1|Phase 3/);
  assert.match(render(PeakReading, { thresholds }), /Awaiting reading/);
});

test("history traces break across phase switches and gaps without inventing measurements", () => {
  const samples = [
    sample(20, 1),
    sample(19, 1),
    sample(18, 2),
    sample(17, 1),
    sample(16, 1),
    sample(3, 1),
  ];
  assert.deepEqual(
    data.phaseSegments(samples, 1).map((run) => run.length),
    [2, 2, 1],
  );
  assert.deepEqual(data.phaseSegments(samples, 3), []);
  const html = render(VoltageChart, {
    samples,
    visible: [1, 2, 3],
    thresholds,
    range: 60,
    endTime: now,
  });
  assert.equal((html.match(/data-phase="1"/g) ?? []).length, 3);
  assert.equal((html.match(/data-phase="2"/g) ?? []).length, 1);
  assert.ok(!html.includes('data-phase="3"'));
  assert.ok(!html.includes("NaN"));
});

test("CSV exports a single phase, voltage, raw mV and ADC value per sample", () => {
  const csv = data.telemetryCsv(
    data.samplesInLastMinute([sample(61), sample(0, 3)], now),
  );
  const [headers, row] = csv.split("\r\n");
  assert.equal(
    headers,
    "timestamp,source,phase,voltage_kv,sensor_mv,adc_count,altitude_m,battery_pct,distance_m,speed_ms",
  );
  assert.equal(row.split(",").length, 10);
  assert.equal(row.split(",")[2], "3");
  assert.equal(row.split(",")[4], "1728");
  assert.equal(csv.split("\r\n").length, 2);
});

test("overview renders one peak reading and one raw measurement row", () => {
  const html = render(App, {});
  assert.equal(
    (html.match(/aria-label="Peak voltage measurement"/g) ?? []).length,
    1,
  );
  const table = html.match(
    /<table class="sensor-table">([\s\S]*?)<\/table>/,
  )?.[1];
  assert.ok(table);
  assert.equal((table.match(/<tr>/g) ?? []).length, 2);
  assert.doesNotMatch(html, /Phase A|Phase B|Phase C|Voltage unbalance|NaN/);
});
