from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.main import create_app, simulated_sample


def sensor_payload():
    data = simulated_sample(datetime.now(timezone.utc)).model_dump(mode="json")
    del data["source"]
    return data


def test_simulation_history_and_ingestion_guard():
    with TestClient(create_app(simulation=True)) as client:
        assert client.get("/api/health").json()["mode"] == "simulation"
        assert client.get("/api/telemetry/latest").json()["source"] == "simulation"
        history = client.get("/api/telemetry/history?seconds=60").json()["samples"]
        assert 58 <= len(history) <= 61
        assert all(sample["phase"] in (1, 2, 3) for sample in history)
        assert all("phases" not in sample for sample in history)
        assert set(history[0]["reading"]) == {"voltage_kv", "sensor_mv", "adc_count"}
        assert client.get("/api/telemetry/history?seconds=9999").status_code == 422
        assert client.post("/api/telemetry", json=sensor_payload()).status_code == 409


def test_sensor_ingestion_and_ordering():
    with TestClient(create_app(simulation=False)) as client:
        assert client.get("/api/telemetry/latest").status_code == 404
        assert client.get("/api/telemetry/history").json()["samples"] == []
        payload = sensor_payload()
        assert client.post("/api/telemetry", json=payload).status_code == 201
        assert client.get("/api/telemetry/latest").json()["source"] == "sensor"
        assert client.post("/api/telemetry", json=payload).status_code == 409
        assert len(client.get("/api/telemetry/history").json()["samples"]) == 1


def test_sensor_validation():
    with TestClient(create_app(simulation=False)) as client:
        for field, value in [("battery_pct", 101), ("distance_m", -1), ("altitude_m", -1)]:
            payload = sensor_payload()
            payload["drone"][field] = value
            assert client.post("/api/telemetry", json=payload).status_code == 422
        payload = sensor_payload()
        payload["reading"]["adc_count"] = 4096
        assert client.post("/api/telemetry", json=payload).status_code == 422


def test_sensor_phase_switches_and_single_reading_schema():
    with TestClient(create_app(simulation=False)) as client:
        now = datetime.now(timezone.utc)
        for index, phase in enumerate((1, 2, 3)):
            payload = sensor_payload()
            payload["phase"] = phase
            payload["timestamp"] = (now - timedelta(seconds=3-index)).isoformat()
            result = client.post("/api/telemetry", json=payload)
            assert result.status_code == 201
            assert result.json()["phase"] == phase
            assert result.json()["reading"] == payload["reading"]
            assert "phases" not in result.json()
        samples = client.get("/api/telemetry/history?seconds=60").json()["samples"]
        assert [sample["phase"] for sample in samples] == [1, 2, 3]
        for invalid in (0, 4, "A", "1", True, 1.5, None):
            payload = sensor_payload()
            payload["phase"] = invalid
            assert client.post("/api/telemetry", json=payload).status_code == 422
        payload = sensor_payload()
        del payload["reading"]
        assert client.post("/api/telemetry", json=payload).status_code == 422
        payload = sensor_payload()
        payload["timestamp"] = datetime.now().isoformat()
        assert client.post("/api/telemetry", json=payload).status_code == 422
        payload["timestamp"] = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        assert client.post("/api/telemetry", json=payload).status_code == 422
