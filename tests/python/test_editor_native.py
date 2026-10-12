"""Applying editor scenes to the native engine: success, and early reporting of engine problems."""
import copy

import jsonschema
import pytest
from fastapi.testclient import TestClient

from mechsim.server.app import create_app
from mechsim.sim import Simulation
from scene_factory import base

pytestmark = pytest.mark.native


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("MECHSIM_USER_SCENES", str(tmp_path))
    with TestClient(create_app(Simulation, "native")) as c:
        yield c


def test_apply_runs_a_scene_with_every_new_type(client, state_schema):
    assert client.post("/api/scene/apply", json={"scene": base()}).status_code == 200


def test_two_supports_that_over_constrain_are_reported_at_apply_time(client):
    # Two Loslager on the same point with the same direction: the constraint matrix is singular.
    s = base()
    s["constraints"] = [
        {"id": "B1", "type": "roller_support", "body": "m1", "point": [0, -0.1], "params": {"angle": 0}},
        {"id": "B2", "type": "roller_support", "body": "m1", "point": [0, -0.1], "params": {"angle": 0}},
    ]
    client.post("/api/scene/load", json={"name": "single_mass_spring"})
    r = client.post("/api/scene/apply", json={"scene": s})
    assert r.status_code == 422
    assert "singular" in r.json()["detail"]
    assert client.get("/api/scene").json()["name"] == "single_mass_spring"  # previous scene survives


def test_two_fixed_supports_on_one_body_are_reported_as_singular(client):
    s = copy.deepcopy(base())
    s["constraints"] = [
        {"id": "E1", "type": "fixed_support", "body": "m3", "point": [0, 0]},
        {"id": "E2", "type": "fixed_support", "body": "m3", "point": [0.1, 0]},
    ]
    r = client.post("/api/scene/apply", json={"scene": s})
    assert r.status_code == 422
    assert "singular" in r.json()["detail"]


def test_native_frames_of_every_new_type_match_the_state_schema(state_schema):
    with Simulation(base()) as sim:
        for _ in range(5):
            sim.step(n=3)
            frame = sim.frame()
            jsonschema.validate(frame, state_schema)
    types = {e["type"] for e in frame["elements"]} | {c["type"] for c in frame["constraints"]}
    assert types == {"spring", "load", "pin_support", "fixed_support", "roller_support"}
