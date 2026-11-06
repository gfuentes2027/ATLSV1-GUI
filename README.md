# ATLS V1 · Ground Control

A responsive UAV transmission-line monitoring dashboard built with **React + TypeScript + Vite** and **Python FastAPI**, themed for **E-Field Dynamics** with the supplied logo, navy surfaces, electric-blue accents, and white panels. Brand colors are centralized as CSS custom properties in `frontend/src/styles.css`; the original logo is served locally from `frontend/public/branding/e-field-dynamics-logo.png`.

## Included

- Peak measured voltage in kV for the active phase (1, 2, or 3), the time that peak was recorded, and deviation from nominal.
- Raw sensor output in mV and 12-bit ADC counts for the currently measured phase.
- Drone altitude above ground, battery percentage, distance to the line, and ground speed.
- Flight geometry schematic, configurable voltage/clearance/battery thresholds.
- Rolling one-minute telemetry log with phase, measured voltage, raw sensor mV, altitude, battery, distance, and source. Log CSV exports use the same one-minute window; overview exports include the most recent five minutes of loaded telemetry. Pause/resume controls are included.
- One-second simulated telemetry, a real-sensor ingestion endpoint, and explicit offline/stale states.

## Run on Windows

Requirements: **Node.js 22.12+** and **Python 3.10+**. Run these commands in `ATLSV1-GUI`:

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
cd frontend
npm install
cd ..
.\Start-ATLS.cmd
```

The launcher opens **http://127.0.0.1:5173** once both services are ready. Keep the launcher terminal open; Ctrl+C stops both servers. It works from PowerShell or Command Prompt without changing PowerShell execution policy. The launcher uses an installed Node runtime or the ignored portable runtime in `.tools` when available. Dependencies and a virtual environment have already been installed in this checkout. Use `--no-browser` to skip automatically opening the browser. The original `Start-ATLS.ps1` is also available on systems that permit PowerShell scripts.

Alternatively, run the backend and frontend in separate terminals:

```powershell
# Terminal 1 — from ATLSV1-GUI
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

```powershell
# Terminal 2 — from ATLSV1-GUI/frontend
npm run dev
```

The Vite development and preview servers proxy `/api` to the backend on port 8000. API documentation is at **http://127.0.0.1:8000/docs**.

## Data modes

The backend defaults to **simulation**, seeded with 15 minutes of generated data and updated every second. It measures one phase per sample and switches between phases 1, 2, and 3 every 20 seconds. The source badge always identifies simulated measurements.

If the backend has never connected, the frontend displays an explicitly labeled **offline demo** and retries automatically. After a successful connection, a disconnect retains the last readings and marks them as disconnected/stale. It does not replace actual sensor measurements with generated values. Pausing freezes the display; resuming reloads history.

For real sensor data, start the launcher with:

```powershell
.\Start-ATLS.cmd --sensor
```

Or set `$env:ATLS_SIMULATION = 'false'` before starting Uvicorn. The dashboard will wait for the first sensor sample. Each sample contains exactly one `phase` (integer 1, 2, or 3) and one `reading` object. This replaces the original three-phase `phases` payload. POST complete samples to `http://127.0.0.1:8000/api/telemetry`:

```json
{
  "timestamp": "2026-11-05T20:00:00Z",
  "phase": 2,
  "reading": {
    "voltage_kv": 69.12,
    "sensor_mv": 1728.0,
    "adc_count": 2144
  },
  "drone": {
    "altitude_m": 32.4,
    "battery_pct": 78.0,
    "distance_m": 8.6,
    "speed_ms": 2.4
  }
}
```

Use the **current UTC timestamp** with a timezone; samples must arrive in strictly increasing timestamp order and cannot be more than five seconds in the future. The API returns 422 for invalid data, 409 for duplicate/out-of-order samples or ingestion during simulation, and 404 when waiting for the first real sample. Field values must be finite; ADC counts must be integers from 0–4095.

`voltage_kv` is the calculated per-phase line voltage, not the raw sensor output. Hardware-specific voltage calibration must occur in your acquisition pipeline. The simulator's sensor conversion is illustrative. Its altitude, speed, and battery are generated demo readings, not a flight model.

| Endpoint                                 | Purpose                                          |
| ---------------------------------------- | ------------------------------------------------ |
| `GET /api/health`                        | Backend health and active data mode              |
| `GET /api/telemetry/latest`              | Most recently received sample                    |
| `GET /api/telemetry/history?seconds=300` | History window, 10–3,600 seconds                 |
| `POST /api/telemetry`                    | Ingest one complete sensor sample in sensor mode |

## Configuration and storage

Open **Monitoring settings** to configure nominal voltage, allowed deviation, minimum clearance, and low battery threshold. Preferences are stored locally in this browser. Defaults (69 kV, ±5%, 5 m, 25%) are demonstration reference values; set values appropriate to your equipment. The schematic is not to scale and does not use GPS data. The main card shows the highest measured voltage for the active phase across all telemetry samples currently loaded in the browser, independently of the one-minute log window. It switches to the corresponding phase peak when the measured phase changes. Peaks can change when older samples leave the retained history or history is reloaded; they are not permanent session records. The card compares the peak with configured thresholds, while alerts, raw measurements, and logs continue to use individual sensor readings. The telemetry log shows every retained sample timestamped within the past 60 seconds relative to the current clock; older readings expire even when updates are paused or disconnected.

The backend retains up to **3,600 samples in memory**; restarting it clears sensor history. The UI retains up to 3,600 received samples and fetches the most recent 15 minutes on connection. CSV timestamps use ISO 8601 UTC; display times use the browser's local timezone. Both services bind to loopback for local operation. The ingestion API has no authentication; add authentication and persistent storage before exposing it beyond the local machine.

## Build and verify

```powershell
# From ATLSV1-GUI/frontend
npm run build
npm test
npm run preview

# From ATLSV1-GUI
.\.venv\Scripts\python.exe -m pytest backend\tests -q
```

The frontend build checks TypeScript before emitting `frontend/dist`. Serve that directory behind a reverse proxy routing `/api` to FastAPI for deployment. Backend tests cover simulation history, real-sensor ingestion, timestamp ordering, empty states, field validation, and mode separation.

## Structure

```text
ATLSV1-GUI/
  frontend/
    src/App.tsx           Dashboard and controls
    src/PeakReading.tsx    Peak measured voltage and active phase
    src/TelemetryLog.tsx   Rolling one-minute measurement log
    src/telemetryData.ts   Validation, time windows, chart segments, and CSV
    src/telemetry.ts      API polling, reconnect, and demo state
    src/types.ts          Shared frontend telemetry types
    src/styles.css        Responsive visual design
    vite.config.mjs       Vite and API proxy configuration
  backend/
    main.py               FastAPI models, storage, simulator, and routes
    tests/test_api.py     API integration tests
    requirements.txt
  Start-ATLS.cmd           Windows launcher without PowerShell policy changes
  scripts/start_atls.py    Launches both services and opens the dashboard
  Start-ATLS.ps1           Optional PowerShell launcher
```

Framework references: [Vite guide](https://vite.dev/guide/), [FastAPI CORS](https://fastapi.tiangolo.com/tutorial/cors/).
