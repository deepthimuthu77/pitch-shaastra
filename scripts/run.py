import argparse
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(command, **kwargs):
    subprocess.run([str(item) for item in command], check=True, cwd=ROOT, **kwargs)


def free_port(port):
    with socket.socket() as connection:
        try:
            connection.bind(("127.0.0.1", port))
        except OSError:
            raise SystemExit(f"Port {port} is busy. Stop that service or choose another port.") from None


def main():
    parser = argparse.ArgumentParser(description="Run PitchGrill natively on Windows, Linux or macOS")
    parser.add_argument("--api-port", type=int, default=8000)
    parser.add_argument("--frontend-port", type=int, default=3000)
    parser.add_argument("--skip-install", action="store_true")
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--production", action="store_true", help="Build and run Next.js instead of dev mode")
    args = parser.parse_args()
    if not (3, 11) <= sys.version_info[:2] <= (3, 13):
        raise SystemExit(
            "Use standard Python 3.11, 3.12 or 3.13. Python 3.14/free-threaded builds are not part of the supported native runtime."
        )
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    node = shutil.which("node")
    if not npm or not node:
        raise SystemExit("Install Node.js 22 or later (LTS recommended), then reopen your terminal.")
    version = subprocess.check_output([node, "--version"], text=True).strip()
    if int(version.lstrip("v").split(".")[0]) < 22:
        raise SystemExit("Node.js 22 or later is required.")
    for port in (args.api_port, args.frontend_port):
        if not 1024 <= port <= 65535:
            raise SystemExit("Choose ports between 1024 and 65535.")
        free_port(port)
    venv_python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not venv_python.exists():
        print("Creating the project virtual environment…", flush=True)
        run([sys.executable, "-m", "venv", ROOT / ".venv"])
    if not args.skip_install:
        print("Installing locked backend and frontend dependencies…", flush=True)
        run([venv_python, "-m", "pip", "install", "-r", "backend/requirements.lock"])
        subprocess.run([npm, "ci"], cwd=ROOT / "frontend", check=True)
    environment = dict(os.environ)
    from_env = subprocess.check_output(
        [
            str(venv_python),
            "-c",
            "import json; from dotenv import dotenv_values; print(json.dumps({k:v for k,v in dotenv_values('.env').items() if v is not None}))",
        ],
        cwd=ROOT,
        text=True,
    )
    import json

    for key, value in json.loads(from_env).items():
        environment.setdefault(key, value)
    environment.update(
        NEXT_PUBLIC_API_URL=f"http://localhost:{args.api_port}",
        PUBLIC_APP_URL=f"http://localhost:{args.frontend_port}",
        ALLOWED_ORIGINS=f"http://localhost:{args.frontend_port},http://127.0.0.1:{args.frontend_port}",
        PYTHONDONTWRITEBYTECODE="1",
    )
    if args.production:
        subprocess.run([npm, "run", "build"], cwd=ROOT / "frontend", env=environment, check=True)
    processes = []
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0

    def launch(command, directory=ROOT):
        process = subprocess.Popen(
            [str(item) for item in command],
            cwd=directory,
            env=environment,
            creationflags=flags,
            start_new_session=os.name != "nt",
        )
        processes.append(process)
        return process

    try:
        launch(
            [
                venv_python,
                "-m",
                "uvicorn",
                "backend.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                args.api_port,
                "--no-proxy-headers",
            ]
        )
        launch([venv_python, "-m", "backend.worker"])
        for _ in range(100):
            try:
                urllib.request.urlopen(f"http://localhost:{args.api_port}/health", timeout=1).close()
                break
            except OSError:
                if any(process.poll() is not None for process in processes):
                    raise RuntimeError("A backend process exited. Check the error above.")
                time.sleep(0.2)
        launch(
            [npm, "run", "start" if args.production else "dev", "--", "--port", args.frontend_port],
            ROOT / "frontend",
        )
        url = f"http://localhost:{args.frontend_port}"
        print(
            f"\nPitchGrill: {url}\nAPI docs: http://localhost:{args.api_port}/docs\nPress Ctrl+C to stop all services.\n",
            flush=True,
        )
        if not args.no_browser:
            for _ in range(100):
                try:
                    urllib.request.urlopen(url, timeout=1).close()
                    import webbrowser

                    webbrowser.open(url)
                    break
                except OSError:
                    time.sleep(0.2)
        while all(process.poll() is None for process in processes):
            time.sleep(0.5)
        raise RuntimeError("A service exited. Check the error above and rerun the launcher.")
    except KeyboardInterrupt:
        print("\nStopping PitchGrill…", flush=True)
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                if os.name == "nt":
                    subprocess.run(
                        ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                else:
                    os.killpg(process.pid, signal.SIGTERM)
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    main()
