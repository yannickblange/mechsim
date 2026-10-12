"""The frame message carries the pose after every engine step (the displacement graphs use it)."""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from mechsim.server.app import create_app
from mechsim.server.mock import MockSimulation
from mechsim.sim import Simulation


def steps_of(client, ws, n=1):
    if not getattr(ws, "_drained", False):
        assert ws.receive_json()["type"] == "status"  # what the server sends on connect
        assert ws.receive_json()["type"] == "frame"  # ... and the t = 0 frame
        ws._drained = True
    msgs = []
    for _ in range(n):
        ws.send_json({"cmd": "step"})
        while True:
            msg = ws.receive_json()
            assert msg["type"] != "error", msg
            if msg["type"] == "frame":
                msgs.append(msg)
                break
    return msgs


@pytest.mark.native
def test_traced_step_equals_plain_steps(load_example):
    scene = load_example("physical_pendulum")
    with Simulation(scene) as a, Simulation(scene) as b:
        trace = a.step_traced(37)
        b.step(n=37)
        assert np.allclose(a.state(), b.state())
        assert len(trace["t"]) == 37 and len(trace["q"]) == 37
        assert trace["ids"] == [body["id"] for body in scene["bodies"]]
        assert trace["t"][-1] == pytest.approx(37 * a.dt)
        assert np.allclose(trace["q"][-1], b.state()[:, :3].ravel())
        assert all(len(row) == 3 * len(trace["ids"]) for row in trace["q"])


@pytest.mark.native
def test_trace_is_thinned_to_the_sample_cap(load_example):
    with Simulation(load_example("single_mass_spring")) as sim:
        trace = sim.step_traced(1000, max_samples=100)
        assert len(trace["t"]) == 100
        assert trace["t"][-1] == pytest.approx(1000 * sim.dt)
        assert sim.time == pytest.approx(1000 * sim.dt)
        assert sim.step_traced(7, max_samples=100)["t"][-1] == pytest.approx(1007 * sim.dt)
        with pytest.raises(ValueError):
            sim.step_traced(0)


@pytest.mark.native
def test_websocket_step_has_a_trace_ending_at_the_frame(load_example):
    with TestClient(create_app(Simulation, "native")) as client:
        assert client.post("/api/scene/load", json={"name": "single_mass_spring"}).status_code == 200
        with client.websocket_connect("/ws") as ws:
            msg = steps_of(client, ws)[0]
            trace = msg["trace"]
            assert len(trace["t"]) > 1
            assert trace["t"][-1] == pytest.approx(msg["data"]["t"])
            body = msg["data"]["bodies"][0]
            k = trace["ids"].index(body["id"])
            assert trace["q"][-1][3 * k + 1] == pytest.approx(body["y"])


def test_mock_traces_too(load_example):
    sim = MockSimulation(load_example("single_mass_spring"))
    trace = sim.step_traced(10)
    assert len(trace["t"]) == 10
    assert trace["t"][-1] == pytest.approx(sim.time)
    with TestClient(create_app(MockSimulation, "mock")) as client:
        assert client.post("/api/scene/load", json={"name": "single_mass_spring"}).status_code == 200
        with client.websocket_connect("/ws") as ws:
            assert "trace" in steps_of(client, ws)[0]
