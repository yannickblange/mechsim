#!/usr/bin/env python3
"""Builds the packaged app for the system it runs on, and tests it:

    python tools/package.py            ->  dist/MechSim-<version>-<system>-<machine>.zip

  Windows:  MechSim-<version>-windows-x86_64.zip  = the folder MechSim\\ with MechSim.exe (double click)
  macOS:    MechSim-<version>-macos-arm64.zip     = MechSim.app (double click)
  Linux:    MechSim-<version>-linux-x86_64.zip    = the folder MechSim/ with the program MechSim

PyInstaller cannot build for another system: run this on each system (or let .github/workflows/package.yml do it).

Needs: Python 3.10 or newer with the packages of the project and PyInstaller
           python -m pip install -e . pyinstaller
       CMake 3.20 or newer and a C / C++ compiler (Xcode command line tools, Visual Studio Build Tools, gcc).
Steps: 1. the native library (build-dist/), 2. PyInstaller (tools/mechsim.spec), 3. the zip with LIESMICH.txt,
       4. a test of the unzipped program: it starts, answers, loads a scene, steps it and has a frame (--skip-test omits it).
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
BUILD = ROOT / "build-dist"
LIB_DIR = ROOT / "python" / "mechsim" / "lib"


def run(cmd: list[str], **kw) -> None:
    print("+", " ".join(str(c) for c in cmd), flush=True)
    subprocess.run([str(c) for c in cmd], check=True, **kw)


def system_name() -> str:
    return {"darwin": "macos", "win32": "windows"}.get(sys.platform, "linux")


def machine_name() -> str:
    m = platform.machine().lower()
    return {"amd64": "x86_64", "x64": "x86_64", "aarch64": "arm64"}.get(m, m)


def build_native() -> None:
    """The shared library, built with the runtime linked in on Windows (no Visual C++ redistributable needed) and for macOS 11 or newer."""
    if shutil.which("cmake") is None:
        sys.exit("CMake not found (https://cmake.org/download/ or: brew install cmake / winget install Kitware.CMake)")
    args = ["cmake", "-S", ROOT, "-B", BUILD, "-DCMAKE_BUILD_TYPE=Release", "-DMECHSIM_BUILD_TESTS=OFF"]
    if sys.platform == "win32":
        args.append("-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded")
    elif sys.platform == "darwin":
        args.append("-DCMAKE_OSX_DEPLOYMENT_TARGET=11.0")
    run(args)
    run(["cmake", "--build", BUILD, "--config", "Release", "--target", "mechsim", "--parallel"])
    if not any(p.name.startswith(("libmechsim", "mechsim.")) for p in LIB_DIR.iterdir()):
        sys.exit(f"the build did not leave the library in {LIB_DIR}")


def version() -> str:
    """The newest folder of docs/tickets (v0.8 > v0.7c > v0.7b > v0.7), without the v."""
    def key(name: str) -> list[int]:
        return [int(x) if x.isdigit() else ord(x[0]) for x in name[1:].replace("b", ".b").replace("c", ".c").split(".")]
    folders = [p.name for p in (ROOT / "docs" / "tickets").glob("v*")]
    return max(folders, key=key)[1:] if folders else "0"


def freeze(ver: str) -> Path:
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        sys.exit("PyInstaller is missing: python -m pip install pyinstaller")
    out = DIST / "app"
    shutil.rmtree(out, ignore_errors=True)
    env = dict(os.environ, MECHSIM_VERSION=ver)
    run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--workpath", BUILD / "pyinstaller", "--distpath", out,
         ROOT / "tools" / "mechsim.spec"], env=env)
    return out


def program(folder: Path) -> Path:
    """The program that a user starts, inside the folder that holds it (the PyInstaller output, or the unzipped zip)."""
    if sys.platform == "darwin":
        return folder / "MechSim.app" / "Contents" / "MacOS" / "MechSim"
    return folder / "MechSim" / ("MechSim.exe" if sys.platform == "win32" else "MechSim")


def make_zip(out: Path, ver: str) -> Path:
    name = f"MechSim-{ver}-{system_name()}-{machine_name()}"
    target = DIST / f"{name}.zip"
    target.unlink(missing_ok=True)
    shutil.copy(ROOT / "tools" / "dist" / "LIESMICH.txt", out / "LIESMICH.txt")
    if sys.platform == "darwin":
        # ditto keeps what an app bundle needs (symbolic links, the executable bits, the signature) and makes the zip the Finder opens
        stage = out / name
        stage.mkdir()
        shutil.move(str(out / "MechSim.app"), stage / "MechSim.app")
        shutil.move(str(out / "LIESMICH.txt"), stage / "LIESMICH.txt")
        run(["ditto", "-c", "-k", "--keepParent", "--norsrc", "--noextattr", "--noqtn", stage, target])
        shutil.move(str(stage / "MechSim.app"), out / "MechSim.app")
        shutil.move(str(stage / "LIESMICH.txt"), out / "LIESMICH.txt")
        stage.rmdir()
    else:
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(out / "LIESMICH.txt", f"{name}/LIESMICH.txt")
            for path in sorted((out / "MechSim").rglob("*")):
                if path.is_file():
                    info = zipfile.ZipInfo.from_file(path, f"{name}/{path.relative_to(out).as_posix()}")
                    info.compress_type = zipfile.ZIP_DEFLATED
                    z.writestr(info, path.read_bytes())
    print(f"-> {target} ({target.stat().st_size / 1e6:.1f} MB)")
    return target


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def fetch(url: str, data: bytes | None = None):
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def smoke_test(target: Path) -> None:
    """Unzips the zip somewhere else and starts the program from there, like a user would (only without a browser)."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        if sys.platform == "darwin":
            run(["ditto", "-x", "-k", target, tmp])
        else:
            with zipfile.ZipFile(target) as z:
                z.extractall(tmp)
        root = next(p for p in tmp.iterdir() if p.is_dir())
        exe = program(root)
        if not exe.exists():
            sys.exit(f"the zip does not contain the program: {exe}")
        port = free_port()
        home = tmp / "home"
        home.mkdir()
        env = dict(os.environ, MECHSIM_USER_SCENES=str(home / "Aufbauten"), HOME=str(home), USERPROFILE=str(home))
        print(f"smoke test: {exe} on port {port}", flush=True)
        proc = subprocess.Popen([str(exe), "--no-browser", "--no-auto-exit", "--port", str(port)], env=env, cwd=tmp,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        try:
            base = f"http://127.0.0.1:{port}"
            for _ in range(120):
                if proc.poll() is not None:
                    sys.exit(f"the program ended at once (code {proc.returncode}):\n{proc.stdout.read()}")
                try:
                    health = fetch(base + "/api/health")
                    break
                except Exception:
                    time.sleep(0.5)
            else:
                sys.exit("the program did not answer within a minute")
            assert health["ok"] and health["mode"] == "native", health
            scenes = fetch(base + "/api/scenes")["scenes"]
            assert "incline_friction" in scenes and len(scenes) >= 20, scenes
            loaded = fetch(base + "/api/scene/load", json.dumps({"name": "incline_friction", "source": "example"}).encode())
            assert loaded["name"] == "incline_friction"
            with urllib.request.urlopen(base + "/", timeout=10) as page:
                assert b"MechSim" in page.read()
            with urllib.request.urlopen(base + "/js/main.js", timeout=10) as js:
                assert js.status == 200
            fetch(base + "/api/scene/save", json.dumps({"name": "smoke_test", "scene": loaded["scene"]}).encode())
            assert (home / "Aufbauten" / "smoke_test.json").is_file(), "a saved layout must go to the user's folder"
            assert fetch(base + "/api/health")["can_quit"] is True
            fetch(base + "/api/shutdown", b"{}")  # what the "Beenden" button does
            assert proc.wait(timeout=20) == 0, "the program must end by itself when the page asks it to"
            print("smoke test passed: starts, native engine, example scene, frontend files, saving, ends on request", flush=True)
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    proc.kill()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--skip-native", action="store_true", help="use the library that is in python/mechsim/lib already")
    parser.add_argument("--skip-test", action="store_true", help="do not test the zip")
    parser.add_argument("--version", default=None, help="version in the name of the zip (default: the newest folder of docs/tickets)")
    args = parser.parse_args()
    ver = args.version or version()
    if not args.skip_native:
        build_native()
    out = freeze(ver)
    target = make_zip(out, ver)
    if not args.skip_test:
        smoke_test(target)


if __name__ == "__main__":
    main()
