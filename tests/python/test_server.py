"""REST and WebSocket tests for the server (mock simulation)."""
from __future__ import annotations

import json

import jsonschema
import pytest
from fastapi.testclient import TestClient

from mechsim import paths
from mechsim.server.app import create_app
from mechsim.server.mock import MockSimulation

SCENES = [
    "cantilever_clamp",
    "disc_force_spring",
    "impulse_pendulum",
    "incline_roller",
    "physical_pendulum",
    "pinned_block_spring",
    "single_mass_spring",
    "two_mass_chain",
]


@pytest.fixture
def client():
    with TestClient(create_app(MockSimulation, "mock")) as c:
        yield c


def _read_until(ws, msg_type: str, limit: int = 10) -> dict:
    for _ in range(limit):
        msg = ws.receive_json()
        if msg["type"] == msg_type:
            return msg
    raise AssertionError(f"no '{msg_type}' message within {limit} messages")


def test_health(client):
    body = client.get("/api/health").json()
    assert body["ok"] is True
    assert body["mode"] == "mock"


def test_scenes_listed(client):
    assert client.get("/api/scenes").json()["scenes"] == SCENES


@pytest.mark.parametrize("name", SCENES)
def test_load_each_scene(client, name):
    r = client.post("/api/scene/load", json={"name": name})
    assert r.status_code == 200
    assert "scene" in r.json()
    assert client.get("/api/scene").json()["name"] == name


def test_unknown_scene_is_404(client):
    assert client.post("/api/scene/load", json={"name": "nope"}).status_code == 404


def test_invalid_scene_is_422(client, tmp_path, monkeypatch):
    scene = json.loads((paths.SCENES_DIR / "single_mass_spring.json").read_text())
    scene["bodies"][0]["type"] = "sphere"
    (tmp_path / "broken.json").write_text(json.dumps(scene))
    monkeypatch.setattr(paths, "SCENES_DIR", tmp_path)
    assert client.post("/api/scene/load", json={"name": "broken"}).status_code == 422


def test_index_is_html(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert r.headers["cache-control"] == "no-store"


def test_websocket_sends_status_first(client):
    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "status"


def test_websocket_step_returns_frame(client, state_schema):
    client.post("/api/scene/load", json={"name": "single_mass_spring"})
    with client.websocket_connect("/ws") as ws:
        _read_until(ws, "status")
        ws.send_json({"cmd": "step"})
        # The frame sent on connect has t = 0; the step produces the first frame with t > 0.
        for _ in range(10):
            msg = ws.receive_json()
            if msg["type"] == "frame" and msg["data"]["t"] > 0:
                break
        else:
            raise AssertionError("no frame with t > 0 within 10 messages")
        jsonschema.validate(msg["data"], state_schema)


def test_websocket_unknown_command(client):
    with client.websocket_connect("/ws") as ws:
        _read_until(ws, "status")
        ws.send_json({"cmd": "bogus"})
        assert "bogus" in _read_until(ws, "error")["message"]


def test_websocket_play_runs_and_pauses(client):
    client.post("/api/scene/load", json={"name": "single_mass_spring"})
    with client.websocket_connect("/ws") as ws:
        _read_until(ws, "status")
        ws.send_json({"cmd": "play"})
        t = 0.0
        for _ in range(10):
            msg = ws.receive_json()
            if msg["type"] == "frame":
                t = max(t, msg["data"]["t"])
            if t > 0:
                break
        assert t > 0
        ws.send_json({"cmd": "pause"})
        for _ in range(20):
            msg = ws.receive_json()
            if msg["type"] == "status" and not msg["running"]:
                break
        else:
            raise AssertionError("never saw a paused status")
