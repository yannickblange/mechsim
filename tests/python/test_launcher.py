"""The starter of the packaged app (mechsim.launcher): ports, one instance, ending by itself and from the page, the user's folder."""
from __future__ import annotations

import http.server
import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from mechsim import launcher
from mechsim.server.app import create_app
from mechsim.server.mock import MockSimulation

ROOT = Path(__file__).resolve().parents[2]


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Health(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        body = json.dumps({"ok": True}).encode() if self.path == "/api/health" else b"{}"
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def test_the_user_folder_is_documents_mechsim_and_saved_layouts_go_there(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.delenv("MECHSIM_USER_SCENES", raising=False)
    assert launcher.data_dir() == tmp_path / "MechSim"  # no Documents folder: the home folder
    (tmp_path / "Documents").mkdir()
    folder = launcher.setup_environment()
    assert folder == tmp_path / "Documents" / "MechSim" and folder.is_dir()
    assert os.environ["MECHSIM_USER_SCENES"] == str(folder / "Aufbauten")
    monkeypatch.setenv("MECHSIM_USER_SCENES", "/somewhere/else")
    launcher.setup_environment()
    assert os.environ["MECHSIM_USER_SCENES"] == "/somewhere/else"  # an explicit choice wins


def test_choose_port_skips_busy_ports_and_finds_a_running_mechsim():
    busy = socket.socket()
    busy.bind(("127.0.0.1", 0))
    busy.listen()
    port = busy.getsockname()[1]
    try:
        assert not launcher.port_free(port)
        assert not launcher.mechsim_at(port)  # something else listens there
        chosen, running = launcher.choose_port(port, tries=10)
        assert chosen is not None and chosen != port and not running
        # a MechSim on that port: it is the one to use
        busy.close()
        server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Health)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            assert launcher.mechsim_at(port)
            assert launcher.choose_port(port, tries=10) == (port, True)
        finally:
            server.shutdown()
    finally:
        busy.close()


def test_the_idle_watch_ends_the_server_only_after_a_tab_has_been_and_gone():
    class Server:
        should_exit = False

    class Session:
        clients: set = set()

    server, session = Server(), Session()
    thread = threading.Thread(target=launcher.watch_idle, args=(server, session, 0.3, 0.05), daemon=True)
    thread.start()
    time.sleep(0.6)
    assert not server.should_exit  # nobody has connected yet: it waits
    session.clients = {object()}
    time.sleep(0.4)
    assert not server.should_exit
    session.clients = set()
    time.sleep(0.2)
    assert not server.should_exit  # a reload takes a moment
    time.sleep(0.5)
    assert server.should_exit
    thread.join(timeout=2)


def test_the_page_can_end_a_launched_program_but_not_a_server_started_by_hand():
    with TestClient(create_app(MockSimulation, "mock")) as client:
        assert client.get("/api/health").json()["can_quit"] is False
        assert client.post("/api/shutdown").status_code == 404

    app = create_app(MockSimulation, "mock")
    stopped = threading.Event()
    app.state.shutdown = stopped.set
    with TestClient(app) as client:
        assert client.get("/api/health").json()["can_quit"] is True
        assert client.post("/api/shutdown").json() == {"ok": True}
        assert stopped.wait(timeout=3)


def test_a_launched_program_answers_runs_once_and_ends_when_the_page_says_so(tmp_path):
    port = free_port()
    env = dict(os.environ, PYTHONPATH=str(ROOT / "python"), MECHSIM_USER_SCENES=str(tmp_path / "Aufbauten"), HOME=str(tmp_path),
               USERPROFILE=str(tmp_path))
    cmd = [sys.executable, "-m", "mechsim.launcher", "--mock", "--no-browser", "--port", str(port)]
    proc = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    try:
        base = f"http://127.0.0.1:{port}"
        for _ in range(100):
            if launcher.mechsim_at(port):
                break
            assert proc.poll() is None, proc.stdout.read()
            time.sleep(0.1)
        else:
            pytest.fail("the program did not answer")
        assert json.load(urllib.request.urlopen(base + "/api/health"))["can_quit"] is True
        assert b"MechSim" in urllib.request.urlopen(base + "/").read()
        # started a second time (a second double click): it finds the first one and ends at once
        second = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=30)
        assert second.returncode == 0
        assert proc.poll() is None
        request = urllib.request.Request(base + "/api/shutdown", method="POST")
        assert json.load(urllib.request.urlopen(request))["ok"] is True
        assert proc.wait(timeout=15) == 0
    finally:
        if proc.poll() is None:
            proc.kill()
