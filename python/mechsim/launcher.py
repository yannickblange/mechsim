"""Starter of the packaged app (tools/package.py) and of `python -m mechsim.launcher`: the same program on Windows, macOS and Linux.

What it does, in this order:
  1. a saved layout goes to a folder of the user (Documents/MechSim/Aufbauten), not into the program folder, which may be read-only;
  2. if MechSim already runs (its port answers /api/health), it opens the browser there and exits: one instance;
  3. otherwise it starts the server on port 8000 (or the next free one), opens the browser as soon as the server answers, and
  4. ends the program by itself when the last browser tab has been closed for a while (the page keeps a WebSocket open),
     so that nothing is left running in the background.
Without a console (the macOS app) everything goes to Documents/MechSim/mechsim.log, and a problem at start is shown in a dialog.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

APP_NAME = "MechSim"
DEFAULT_PORT = 8000
PORT_TRIES = 100
IDLE_EXIT_S = 45.0  # no browser tab for this long: the program ends (a reload or a short sleep of the laptop must not end it)
HOST = "127.0.0.1"


# --- where things live ---------------------------------------------------------------------------------------------

def data_dir() -> Path:
    """The folder of the user's own data: Documents/MechSim (the home folder if there is no Documents folder)."""
    home = Path.home()
    base = home / "Documents" if (home / "Documents").is_dir() else home
    return base / APP_NAME


def setup_environment() -> Path:
    """Saved layouts go to <data_dir>/Aufbauten unless MECHSIM_USER_SCENES says otherwise. Returns the data folder."""
    folder = data_dir()
    folder.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("MECHSIM_USER_SCENES", str(folder / "Aufbauten"))
    return folder


def setup_logging(folder: Path, to_file: bool) -> None:
    """Without a console (sys.stdout is None) the log goes to a file, and the standard streams get a sink so that nothing fails on print()."""
    handlers: list[logging.Handler]
    if to_file:
        log = open(folder / "mechsim.log", "a", encoding="utf-8", buffering=1)
        if sys.stdout is None:
            sys.stdout = log
        if sys.stderr is None:
            sys.stderr = log
        handlers = [logging.StreamHandler(log)]
    else:
        handlers = [logging.StreamHandler(sys.stderr)]
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", handlers=handlers, force=True)


def alert(message: str) -> None:
    """A message box for someone who has no console: the program could not start."""
    try:
        if sys.platform == "win32":
            import ctypes

            ctypes.windll.user32.MessageBoxW(None, message, APP_NAME, 0x10)
        elif sys.platform == "darwin":
            text = message.replace("\\", "\\\\").replace('"', '\\"')
            subprocess.run(["osascript", "-e", f'display dialog "{text}" with title "{APP_NAME}" buttons {{"OK"}} with icon stop'], check=False, timeout=60)
    except Exception:
        pass


# --- ports ------------------------------------------------------------------------------------------------------------

def port_free(port: int, host: str = HOST) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) != 0


def mechsim_at(port: int, host: str = HOST) -> bool:
    """Does MechSim answer on this port?"""
    try:
        with urllib.request.urlopen(f"http://{host}:{port}/api/health", timeout=1.0) as response:
            return bool(json.load(response).get("ok"))
    except Exception:
        return False


def choose_port(preferred: int = DEFAULT_PORT, tries: int = PORT_TRIES) -> tuple[int | None, bool]:
    """(port, already_running): the first port from `preferred` on that is free, or the one where MechSim already runs."""
    for port in range(preferred, preferred + tries):
        if port_free(port):
            return port, False
        if mechsim_at(port):
            return port, True
    return None, False


# --- the run ----------------------------------------------------------------------------------------------------------

def watch_idle(server, session, idle_s: float, poll_s: float = 1.0) -> None:
    """Ends the server when no browser tab has been connected for `idle_s` (after at least one has been)."""
    seen = False
    last = time.monotonic()
    while not server.should_exit:
        time.sleep(poll_s)
        if session.clients:
            seen, last = True, time.monotonic()
        elif seen and time.monotonic() - last > idle_s:
            logging.getLogger("mechsim").info("no browser tab for %.0f s: ending", idle_s)
            server.should_exit = True


def open_when_ready(server, url: str, open_browser: bool) -> None:
    while not server.started and not server.should_exit:
        time.sleep(0.1)
    if server.started and open_browser:
        webbrowser.open(url)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MechSim: starts the simulator and opens it in the browser")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-browser", action="store_true", help="do not open the browser")
    parser.add_argument("--no-auto-exit", action="store_true", help="keep running after the last browser tab is closed")
    parser.add_argument("--mock", action="store_true", help="run without the native engine")
    args = parser.parse_args(argv)

    folder = setup_environment()
    setup_logging(folder, to_file=getattr(sys, "frozen", False) and sys.stdout is None)
    log = logging.getLogger("mechsim")

    try:
        port, running = choose_port(args.port)
        if port is None:
            raise RuntimeError(f"No free port found from {args.port} on.")
        url = f"http://{HOST}:{port}/"
        if running:
            log.info("MechSim already runs at %s", url)
            if not args.no_browser:
                webbrowser.open(url)
            return 0

        from mechsim.server.app import create_app

        if args.mock:
            from mechsim.server.mock import MockSimulation as factory
            mode = "mock"
        else:
            from mechsim import _native
            from mechsim.sim import Simulation as factory

            _native.load()  # fail now, with a message, not on the first scene
            mode = "native"

        import uvicorn

        app = create_app(factory, mode)
        # the same transport on every system (no uvloop, no httptools: not available everywhere)
        config = uvicorn.Config(app, host=HOST, port=port, log_config=None, loop="asyncio", http="h11", ws="websockets")
        server = uvicorn.Server(config)
        app.state.shutdown = lambda: setattr(server, "should_exit", True)  # the page's "Beenden" button
        threading.Thread(target=open_when_ready, args=(server, url, not args.no_browser), daemon=True).start()
        if not args.no_auto_exit:
            threading.Thread(target=watch_idle, args=(server, app.state.session, IDLE_EXIT_S), daemon=True).start()
        print(f"{APP_NAME} laeuft auf {url}  -  dieses Fenster schliessen (oder Strg+C) beendet das Programm.")
        print(f"Eigene Aufbauten: {os.environ['MECHSIM_USER_SCENES']}")
        server.run()
        return 0
    except Exception as exc:  # noqa: BLE001 - whatever it is, someone without a console must be told
        log.exception("MechSim could not start")
        alert(f"MechSim konnte nicht gestartet werden:\n\n{exc}\n\nDetails: {folder / 'mechsim.log'}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
