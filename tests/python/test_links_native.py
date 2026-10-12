"""v0.3 scenes in the native engine, through the scene loader and the server."""
import copy

import jsonschema
import pytest
from fastapi.testclient import TestClient

from mechsim.server.app import create_app
from mechsim.sim import Simulation
from scene_factory import base03

pytestmark = pytest.mark.native


def test_base_scene_runs_and_frames_match_the_schema(state_schema):
    with Simulation(base03()) as sim:
        for _ in range(20):
            sim.step(n=10)
            jsonschema.validate(sim.frame(), state_schema)
    with Simulation(base03()) as sim:
        types = {c["type"] for c in sim.frame()["constraints"]}
    assert types == {"pin_support", "pin_joint", "fixed_joint", "rod", "rope"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("MECHSIM_USER_SCENES", str(tmp_path))
    with TestClient(create_app(Simulation, "native")) as c:
        yield c


def test_apply_reports_a_rope_that_is_too_short(client):
    s = base03()
    s["constraints"][5]["params"]["length"] = 0.5  # the ends are about 2.5 m apart
    r = client.post("/api/scene/apply", json={"scene": s})
    assert r.status_code == 422
    assert "only 0.5" in r.json()["detail"]


def test_apply_reports_overconstrained_links(client):
    s = base03()
    # a second identical rod makes the constraint matrix singular
    s["constraints"].append({**copy.deepcopy(s["constraints"][4]), "id": "D2"})
    r = client.post("/api/scene/apply", json={"scene": s})
    assert r.status_code == 422
    assert "singular" in r.json()["detail"]


def test_apply_accepts_the_base_scene(client):
    assert client.post("/api/scene/apply", json={"scene": base03()}).status_code == 200
