"""End to end: HTTP + WebSocket server driving the real native engine."""
import jsonschema
import pytest
from fastapi.testclient import TestClient

from mechsim.scene import list_scenes
from mechsim.server.app import create_app
from mechsim.sim import Simulation

pytestmark = pytest.mark.native


@pytest.fixture
def client():
    with TestClient(create_app(Simulation, "native")) as c:
        yield c


@pytest.mark.parametrize("name", list_scenes())
def test_scene_steps_over_websocket(client, state_schema, name):
    assert client.get("/api/health").json()["mode"] == "native"
    assert client.post("/api/scene/load", json={"name": name}).status_code == 200

    times = []
    with client.websocket_connect("/ws") as ws:
        for _ in range(30):
            ws.send_json({"cmd": "step"})
            while True:  # the step produces exactly one frame, followed by a status
                msg = ws.receive_json()
                assert msg["type"] != "error", msg
                if msg["type"] == "frame":
                    break
            jsonschema.validate(msg["data"], state_schema)
            times.append(msg["data"]["t"])

    # The first message after connecting is the t = 0 frame, which the loop above may consume
    # first; either way time must increase strictly from then on.
    assert all(b > a for a, b in zip(times, times[1:]))
    assert times[-1] > 0
