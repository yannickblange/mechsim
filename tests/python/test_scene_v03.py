"""v0.3 scene format: rope, rod, joints, Festlager in free space."""
from __future__ import annotations

import copy

import jsonschema
import pytest
from fastapi.testclient import TestClient

from mechsim import scene
from mechsim.server.app import create_app
from mechsim.server.mock import MockSimulation
from scene_factory import base, base03


def test_all_v03_types_validate():
    assert scene.validate_scene(base03()) == []


def test_v02_scenes_still_validate():
    assert scene.validate_scene(base()) == []


@pytest.mark.parametrize(
    "mutate, fragment",
    [
        # rope / rod
        (lambda s: s["constraints"][5].pop("a"), "a"),
        (lambda s: s["constraints"][5]["params"].update(length=0), "length"),
        (lambda s: s["constraints"][5]["params"].update(slack=1), "slack"),
        (lambda s: s["constraints"][5].update(body="a"), "body"),
        (lambda s: s["constraints"][4].update(params={"length": 1}), "length"),  # a rod has no length
        (lambda s: s["constraints"][4].update(point=[0, 0]), "point"),
        # joints: both ends on masses
        (lambda s: s["constraints"][2]["b"].update(body=None), "None"),
        (lambda s: s["constraints"][3].pop("b"), "b"),
        (lambda s: s["constraints"][2].update(params={"angle": 1}), "angle"),
        # supports: only the Festlager may be in free space
        (lambda s: s["constraints"].append({"id": "E", "type": "fixed_support", "body": None, "point": [0, 0]}), "None"),
        (lambda s: s["constraints"].append({"id": "B", "type": "roller_support", "body": None, "point": [0, 0]}), "None"),
        (lambda s: s["constraints"][0].update(a={"body": None, "point": [0, 0]}), "a"),
        (lambda s: s["constraints"].append({"id": "X", "type": "hinge"}), "hinge"),
    ],
)
def test_invalid_variants_are_rejected(mutate, fragment):
    broken = copy.deepcopy(base03())
    mutate(broken)
    errors = scene.validate_scene(broken)
    assert errors, "expected validation errors"
    assert any(fragment in e for e in errors), errors


@pytest.mark.parametrize(
    "mutate, fragment",
    [
        (lambda s: s["constraints"][2]["a"].update(body="ghost"), "unknown body 'ghost'"),
        (lambda s: s["constraints"][5]["b"].update(body="ghost"), "unknown body 'ghost'"),
        (lambda s: s["constraints"][4]["a"].update(body="e"), "same mass"),
        (lambda s: s["constraints"][5].update(a={"body": None, "point": [0, 0]}, b={"body": None, "point": [1, 1]}), "two points of the ground"),
        (lambda s: s["constraints"][2]["b"].update(body="a"), "same mass"),
        (lambda s: s["constraints"].append({**s["constraints"][4], "id": "A"}), "duplicate id 'A'"),
        (lambda s: s["constraints"][1].update(body="ghost"), "unknown body 'ghost'"),
    ],
)
def test_reference_errors(mutate, fragment):
    broken = copy.deepcopy(base03())
    mutate(broken)
    assert any(fragment in e for e in scene.validate_scene(broken)), scene.validate_scene(broken)


def test_free_pin_may_reference_a_surface():
    s = base03()
    s["constraints"][1]["surface"] = "s1"
    assert scene.validate_scene(s) == []
    s["constraints"][1]["surface"] = "nowhere"
    assert any("unknown surface" in e for e in scene.validate_scene(s))


def test_mock_frames_cover_every_v03_type(state_schema):
    sim = MockSimulation(base03())
    sim.step(n=3)
    frame = sim.frame()
    jsonschema.validate(frame, state_schema)
    by_id = {c["id"]: c for c in frame["constraints"]}
    assert by_id["P"]["position"] == [0.0, 1.5]
    assert by_id["R1"]["length"] == 3.0 and by_id["R1"]["taut"] is True
    assert by_id["D1"]["p1"] == [1.5, 1.5]
    assert len(by_id["J2"]["reaction"]) == 3 and len(by_id["J1"]["reaction"]) == 2


def test_apply_and_save_v03_scene_through_the_api(tmp_path, monkeypatch):
    monkeypatch.setenv("MECHSIM_USER_SCENES", str(tmp_path))
    with TestClient(create_app(MockSimulation, "mock")) as client:
        assert client.post("/api/scene/apply", json={"scene": base03()}).status_code == 200
        assert client.post("/api/scene/save", json={"name": "links", "scene": base03()}).status_code == 200
        broken = base03()
        broken["constraints"][4]["a"]["body"] = "e"
        r = client.post("/api/scene/apply", json={"scene": broken})
        assert r.status_code == 422 and "same mass" in r.json()["detail"]


# --- damper (v0.3c) ---------------------------------------------------------------------------------------


def with_damper():
    s = base03()
    s["elements"] = [
        {"id": "c1", "type": "damper", "a": {"body": None, "point": [2.0, 1.5]}, "b": {"body": "c", "point": [0, 0]}, "params": {"c": 3.0}}
    ]
    return s


def test_damper_validates():
    assert scene.validate_scene(with_damper()) == []


@pytest.mark.parametrize(
    "mutate, fragment",
    [
        (lambda s: s["elements"][0]["params"].update(c=-1), "c"),
        (lambda s: s["elements"][0]["params"].pop("c"), "c"),
        (lambda s: s["elements"][0]["params"].update(rest_length=1), "rest_length"),
        (lambda s: s["elements"][0].update(body="c"), "body"),
        (lambda s: s["elements"][0].pop("b"), "b"),
    ],
)
def test_damper_invalid_variants(mutate, fragment):
    s = with_damper()
    mutate(s)
    errors = scene.validate_scene(s)
    assert errors and any(fragment in e for e in errors), errors


@pytest.mark.parametrize(
    "mutate, fragment",
    [
        (lambda s: s["elements"][0]["b"].update(body="ghost"), "unknown body 'ghost'"),
        (lambda s: s["elements"][0].update(a={"body": None, "point": [0, 0]}, b={"body": None, "point": [1, 1]}), "two points of the ground"),
        (lambda s: s["elements"][0].update(a={"body": "c", "point": [0, 0]}, b={"body": "c", "point": [0.1, 0]}), "same mass"),
    ],
)
def test_damper_reference_errors(mutate, fragment):
    s = with_damper()
    mutate(s)
    assert any(fragment in e for e in scene.validate_scene(s)), scene.validate_scene(s)


def test_mock_frame_of_a_damper(state_schema):
    sim = MockSimulation(with_damper())
    sim.step(n=2)
    frame = sim.frame()
    jsonschema.validate(frame, state_schema)
    assert frame["elements"][0]["type"] == "damper"
