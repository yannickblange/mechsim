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
    "beam_i_section",
    "bouncing_ball",
    "buckling_columns",
    "cantilever_beam",
    "cantilever_clamp",
    "disc_spring_moment",
    "double_pendulum",
    "forced_vibration",
    "free_vibration",
    "friction_oscillator",
    "half_circle_bowl",
    "harmonic_oscillation",
    "impulse_pendulum",
    "incline_friction",
    "incline_roller",
    "physical_pendulum",
    "pinned_block_spring",
    "resonance",
    "rod_truss",
    "rope_catch",
    "single_mass_spring",
    "spring_damper",
    "truss_bridge",
    "truss_elastic",
    "two_mass_chain",
    "welded_pendulum",
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


# --- v0.5: end time t_max, the time bar (seek) ------------------------------------------------------------


def _status_after(ws, cmd: dict) -> dict:
    """Send a command and return the status that answers it (frames before it are skipped)."""
    ws.send_json(cmd)
    return _read_until(ws, "status", limit=50)


def test_status_reports_the_end_time(client):
    client.post("/api/scene/load", json={"name": "single_mass_spring"})
    with client.websocket_connect("/ws") as ws:
        status = _read_until(ws, "status")
        assert status["t_max"] == 10.0 and status["finished"] is False
        assert _status_after(ws, {"cmd": "tmax", "value": 2.5})["t_max"] == 2.5
        assert _status_after(ws, {"cmd": "tmax", "value": 1e9})["t_max"] == 600.0  # clamped
        assert _status_after(ws, {"cmd": "tmax", "value": 0})["t_max"] == 0.1


def test_a_scene_can_suggest_its_end_time(client):
    client.post("/api/scene/load", json={"name": "resonance"})
    with client.websocket_connect("/ws") as ws:
        assert _read_until(ws, "status")["t_max"] == 30
    client.post("/api/scene/load", json={"name": "single_mass_spring"})  # no t_max: the setting stays
    with client.websocket_connect("/ws") as ws:
        assert _read_until(ws, "status")["t_max"] == 30


def test_bad_end_time_is_an_error(client):
    with client.websocket_connect("/ws") as ws:
        _read_until(ws, "status")
        ws.send_json({"cmd": "tmax", "value": "soon"})
        assert "tmax" in _read_until(ws, "error")["message"]
        ws.send_json({"cmd": "seek", "value": float("nan")})
        assert "seek" in _read_until(ws, "error")["message"]


def test_a_run_stops_exactly_at_t_max_and_play_starts_again(client):
    client.post("/api/scene/load", json={"name": "single_mass_spring"})
    with client.websocket_connect("/ws") as ws:
        _read_until(ws, "status")
        _read_until(ws, "frame")  # the frame sent on connect
        _status_after(ws, {"cmd": "tmax", "value": 0.25})
        _status_after(ws, {"cmd": "speed", "value": 4})
        ws.send_json({"cmd": "play"})
        last_t = 0.0
        for _ in range(200):
            msg = ws.receive_json()
            if msg["type"] == "frame":
                last_t = msg["data"]["t"]
            if msg["type"] == "status" and msg["finished"]:
                break
        else:
            raise AssertionError("the run never finished")
        assert last_t == pytest.approx(0.25) and not msg["running"]
        # step does nothing at the end ...
        assert _status_after(ws, {"cmd": "step"})["finished"] is True
        # ... and play runs again from t = 0
        ws.send_json({"cmd": "play"})
        frame = _read_until(ws, "frame")
        assert frame["data"]["t"] == 0.0
        assert _read_until(ws, "status")["running"] is True


def test_seek_jumps_forward_and_back_with_a_trace(client):
    client.post("/api/scene/load", json={"name": "single_mass_spring"})
    with client.websocket_connect("/ws") as ws:
        _read_until(ws, "status")
        assert _read_until(ws, "frame")["data"]["t"] == 0.0  # the frame sent on connect
        ws.send_json({"cmd": "seek", "value": 1.0})
        msg = _read_until(ws, "frame")
        assert msg["data"]["t"] == pytest.approx(1.0)
        assert 1 < len(msg["trace"]["t"]) <= 600 and msg["trace"]["t"][-1] == pytest.approx(1.0)
        ws.send_json({"cmd": "seek", "value": 0.4})  # back: reset (t = 0), then forward
        assert _read_until(ws, "frame")["data"]["t"] == 0.0
        assert _read_until(ws, "frame")["data"]["t"] == pytest.approx(0.4)
        assert _read_until(ws, "status")["finished"] is False
        status = _status_after(ws, {"cmd": "seek", "value": 99})  # beyond the end: stops at t_max
        assert status["finished"] is True and status["running"] is False
