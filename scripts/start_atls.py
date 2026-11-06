"""Launch both local services without requiring PowerShell script execution."""

import argparse
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser


PROJECT = Path(__file__).resolve().parents[1]
DASHBOARD_URL = "http://127.0.0.1:5173"


def main() -> int:
    parser = argparse.ArgumentParser(description="Start the ATLS dashboard and API")
    parser.add_argument("--sensor", "-Sensor", action="store_true", help="Accept real sensor measurements instead of simulation")
    parser.add_argument("--no-browser", action="store_true", help="Do not open the browser automatically")
    parser.add_argument("--check", action="store_true", help="Check dependencies and ports without starting services")
    options = parser.parse_args()
    portable_node = PROJECT / ".tools" / "node-v22.14.0-win-x64" / "node.exe"
    node = shutil.which("node") or (str(portable_node) if portable_node.exists() else None)
    vite = PROJECT / "frontend" / "node_modules" / "vite" / "bin" / "vite.js"
    if not node:
        print("Node.js was not found. Install Node.js 22.12+ or restore the portable runtime.", file=sys.stderr)
        return 1
    if not vite.exists():
        print("Frontend dependencies are missing. Run npm install inside frontend.", file=sys.stderr)
        return 1
    try:
        import uvicorn  # noqa: F401
    except ImportError:
        print("Backend dependencies are missing. Install backend/requirements.txt in .venv.", file=sys.stderr)
        return 1
    for port in (8000, 5173):
        with socket.socket() as probe:
            probe.settimeout(0.5)
            if probe.connect_ex(("127.0.0.1", port)) == 0:
                print(f"Port {port} is already in use. Stop the existing server and try again.", file=sys.stderr)
                return 1
    if options.check:
        print("Dependencies found; ports 8000 and 5173 are available.")
        return 0

    log_directory = PROJECT / ".tools"
    log_directory.mkdir(exist_ok=True)
    environment = {**os.environ, "ATLS_SIMULATION": "false" if options.sensor else "true"}
    commands = [
        ([sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"], PROJECT, "backend"),
        ([node, str(vite), "--configLoader", "native", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], PROJECT / "frontend", "frontend"),
    ]
    processes: list[subprocess.Popen] = []
    logs = []
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    try:
        for command, directory, name in commands:
            log = (log_directory / f"{name}-launcher.log").open("w", encoding="utf-8")
            logs.append(log)
            processes.append(subprocess.Popen(command, cwd=directory, env=environment, stdout=log, stderr=subprocess.STDOUT, creationflags=flags))
        print("Starting ATLS...", flush=True)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        deadline = time.monotonic() + 30
        while True:
            if any(process.poll() is not None for process in processes):
                raise RuntimeError("A service stopped during startup.")
            try:
                for url in ("http://127.0.0.1:8000/api/health", DASHBOARD_URL):
                    with opener.open(url, timeout=1) as response:
                        if response.status != 200:
                            raise RuntimeError(f"Unexpected response from {url}")
                break
            except (urllib.error.URLError, TimeoutError, OSError):
                if time.monotonic() >= deadline:
                    raise RuntimeError("Services did not become ready within 30 seconds.")
                time.sleep(0.2)
        print(f"Dashboard ready: {DASHBOARD_URL}", flush=True)
        print("API docs: http://127.0.0.1:8000/docs", flush=True)
        print("Keep this terminal open. Press Ctrl+C to stop both services.", flush=True)
        if not options.no_browser:
            webbrowser.open(DASHBOARD_URL)
        while all(process.poll() is None for process in processes):
            time.sleep(0.5)
        raise RuntimeError("A service stopped.")
    except KeyboardInterrupt:
        print("\nStopping ATLS...", flush=True)
        return 0
    except (OSError, RuntimeError) as error:
        print(f"{error} See .tools/backend-launcher.log and .tools/frontend-launcher.log.", file=sys.stderr)
        return 1
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        for log in logs:
            log.close()


if __name__ == "__main__":
    raise SystemExit(main())
