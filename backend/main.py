"""ATLS telemetry API. All voltages use kV; flight distances use meters."""

import asyncio
import math
import os
from collections import deque
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator


class PhaseReading(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    voltage_kv: float = Field(ge=0, le=1000)
    sensor_mv: float = Field(ge=0, le=3300)
    adc_count: int = Field(ge=0, le=4095)


class DroneReading(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    altitude_m: float = Field(ge=0, le=10000)
    battery_pct: float = Field(ge=0, le=100)
    distance_m: float = Field(ge=0, le=10000)
    speed_ms: float = Field(ge=0, le=200)


class TelemetryInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    timestamp: datetime
    phase: Literal[1, 2, 3]
    reading: PhaseReading
    drone: DroneReading

    @field_validator("phase", mode="before")
    @classmethod
    def phase_is_integer(cls, value):
        if type(value) is not int:
            raise ValueError("phase must be the integer 1, 2, or 3")
        return value

    @field_validator("timestamp")
    @classmethod
    def timestamp_has_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timestamp must include a timezone")
        value = value.astimezone(timezone.utc)
        if value > datetime.now(timezone.utc) + timedelta(seconds=5):
            raise ValueError("timestamp cannot be in the future")
        return value


class Telemetry(TelemetryInput):
    source: Literal["simulation", "sensor"]


class HistoryResponse(BaseModel):
    samples: list[Telemetry]
    mode: Literal["simulation", "sensor"]
    sample_interval_seconds: int = 1


def simulated_sample(timestamp: datetime) -> Telemetry:
    t = timestamp.timestamp()
    # The single sensor switches to another phase every 20 seconds in demo mode.
    phase = int(t // 20) % 3 + 1
    index = phase - 1
    kv = round(69 + [0.24, -0.32, 0.07][index]
               + 0.65 * math.sin(t / 19 + index * 1.8)
               + 0.22 * math.sin(t / 3.1 + index), 3)
    mv = round(kv / 100 * 2500, 2)
    return Telemetry(
        timestamp=timestamp, source="simulation", phase=phase,
        reading=PhaseReading(voltage_kv=kv, sensor_mv=mv, adc_count=round(mv / 3300 * 4095)),
        drone=DroneReading(
            altitude_m=round(32.4 + 0.55 * math.sin(t / 35), 2),
            battery_pct=round(78 + math.sin(t / 180), 1),
            distance_m=round(8.6 + 0.35 * math.sin(t / 28), 2),
            speed_ms=round(2.4 + 0.2 * math.sin(t / 20), 2),
        ),
    )


class TelemetryStore:
    def __init__(self, simulation: bool):
        self.simulation = simulation
        self.samples: deque[Telemetry] = deque(maxlen=3600)
        self.lock = asyncio.Lock()

    async def append(self, sample: Telemetry) -> None:
        async with self.lock:
            if self.samples and sample.timestamp <= self.samples[-1].timestamp:
                raise HTTPException(409, "Timestamp must be newer than the latest sample")
            self.samples.append(sample)


def create_app(simulation: bool | None = None) -> FastAPI:
    if simulation is None:
        simulation = os.getenv("ATLS_SIMULATION", "true").lower() in {"true", "1", "yes"}
    store = TelemetryStore(simulation)

    async def simulate() -> None:
        while True:
            await asyncio.sleep(1)
            await store.append(simulated_sample(datetime.now(timezone.utc)))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = None
        if store.simulation:
            now = datetime.now(timezone.utc)
            for i in range(900, -1, -1):
                store.samples.append(simulated_sample(now - timedelta(seconds=i)))
            task = asyncio.create_task(simulate())
        yield
        if task:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    app = FastAPI(title="ATLS Ground Control API", version="1.0.0", lifespan=lifespan)
    app.state.store = store
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                       "http://localhost:4173", "http://127.0.0.1:4173"],
        allow_methods=["GET", "POST"], allow_headers=["Content-Type"],
    )

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "mode": "simulation" if store.simulation else "sensor"}

    @app.get("/api/telemetry/latest", response_model=Telemetry)
    async def latest():
        async with store.lock:
            if not store.samples:
                raise HTTPException(404, "Waiting for the first sensor sample")
            return store.samples[-1]

    @app.get("/api/telemetry/history", response_model=HistoryResponse)
    async def history(seconds: int = Query(default=300, ge=10, le=3600)):
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=seconds)
        async with store.lock:
            return HistoryResponse(
                samples=[sample for sample in store.samples if sample.timestamp >= cutoff],
                mode="simulation" if store.simulation else "sensor",
            )

    @app.post("/api/telemetry", response_model=Telemetry, status_code=201)
    async def ingest(payload: TelemetryInput):
        if store.simulation:
            raise HTTPException(409, "Set ATLS_SIMULATION=false before posting sensor data")
        sample = Telemetry(**payload.model_dump(), source="sensor")
        await store.append(sample)
        return sample

    return app


app = create_app()
