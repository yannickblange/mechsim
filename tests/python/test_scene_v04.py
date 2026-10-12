"""v0.4 scene format: node, beam, bar, sections, harmonic loads."""
from __future__ import annotations

import copy

import pytest
from fastapi.testclient import TestClient

from mechsim import scene
from mechsim.server.app import create_app
from mechsim.server.mock import MockSimulation
from scene_factory import base, base03, base04, sections


def test_all_v04_types_validate():
    assert scene.validate_scene(base04()) == []


def test_older_scenes_still_validate():
    assert scene.validate_scene(base()) == []
    assert scene.validate_scene(base03()) == []


@pytest.mark.parametrize("section", sections(), ids=lambda s: s["type"])
def test_every_section_type_is_accepted_for_beams_and_bars(section):
    s = base04()
    s["bodies"][0]["params"]["section"] = section
    s["elements"][0]["params"]["section"] = section
    assert scene.validate_scene(s) == []


@pytest.mark.parametrize(
    "mutate, fragment",
    [
        # sections
        (lambda s: s["bodies"][0]["params"]["section"].update(type="round"), "unknown section type 'round'"),
        (lambda s: s["bodies"][0]["params"]["section"].update(a=0), "a"),
        (lambda s: s["bodies"][0]["params"].update(section={"type": "I", "b": 0.1, "h": 0.2, "tf": 0.01}), "tw"),
        (lambda s: s["bodies"][0]["params"].update(section={"type": "L", "b": 0.1, "h": 0.2, "t": 0.01, "tw": 1}), "tw"),
        (lambda s: s["bodies"][0]["params"].pop("section"), "section"),
        (lambda s: s["elements"][0]["params"].pop("section"), "section"),
        # beam
        (lambda s: s["bodies"][0]["params"].update(length=0), "length"),
        (lambda s: s["bodies"][0]["params"].update(segments=1), "segments"),
        (lambda s: s["bodies"][0]["params"].update(segments=2.5), "segments"),
        (lambda s: s["bodies"][0]["params"].update(mass=-1), "mass"),
        (lambda s: s["bodies"][0]["params"].update(width=1), "width"),
        # node
        (lambda s: s["bodies"][1]["params"].pop("mass"), "mass"),
        (lambda s: s["bodies"][1]["params"].update(radius=1), "radius"),
        # bar
        (lambda s: s["elements"][0]["params"].update(k=1), "k"),
        (lambda s: s["elements"][0].pop("b"), "b"),
        (lambda s: s["elements"][0].update(body="N2"), "body"),
        # harmonic load
        (lambda s: s["elements"][2]["params"].update(mode="sine"), "sine"),
        (lambda s: s["elements"][2]["params"].update(frequency=0), "frequency"),
    ],
)
def test_invalid_variants_are_rejected(mutate, fragment):
    broken = copy.deepcopy(base04())
    mutate(broken)
    errors = scene.validate_scene(broken)
    assert errors, "expected validation errors"
    assert any(fragment in e for e in errors), errors


@pytest.mark.parametrize(
    "mutate, fragment",
    [
        (lambda s: s["elements"][0]["a"].update(body="ghost"), "unknown body 'ghost'"),
        (lambda s: s["elements"][1]["b"].update(body="N2"), "same mass"),
        (lambda s: s["elements"][0].update(a={"body": None, "point": [0, 0]}, b={"body": None, "point": [1, 0]}), "two points of the ground"),
        (lambda s: s["elements"][4]["b"].update(point=[0.7, 0.0]), "outside the beam"),
        (lambda s: s["constraints"][0].update(point=[-0.6, 0.0]), "outside the beam"),
        (lambda s: s["elements"][3].update(point=[0.0, 0.0]) or s["elements"][3].update(point=[-0.51, 0.0]), "outside the beam"),
        (lambda s: s["bodies"][0]["params"].update(section={"type": "I", "b": 0.1, "h": 0.02, "tf": 0.02, "tw": 0.01}), "flanges"),
        (lambda s: s["elements"][1]["params"].update(section={"type": "T", "b": 0.1, "h": 0.1, "tf": 0.1, "tw": 0.01}), "flange thickness"),
        (lambda s: s["elements"][0]["params"].update(section={"type": "L", "b": 0.01, "h": 0.1, "t": 0.02}), "thickness"),
        (lambda s: s["bodies"].append({**s["bodies"][1], "id": "beam"}), "duplicate id 'beam'"),
    ],
)
def test_reference_errors(mutate, fragment):
    broken = copy.deepcopy(base04())
    mutate(broken)
    assert any(fragment in e for e in scene.validate_scene(broken)), scene.validate_scene(broken)


def test_the_mock_simulates_every_v04_type_with_valid_frames(state_schema):
    import jsonschema

    sim = MockSimulation(base04())
    sim.step(n=5)
    jsonschema.validate(sim.frame(), state_schema)


def test_example_scenes_directory_still_validates():
    for name in scene.list_scenes():
        assert scene.validate_scene(scene.load_scene(name)) == []


def test_saving_a_scene_with_an_impossible_section_is_refused(tmp_path, monkeypatch):
    monkeypatch.setenv("MECHSIM_USER_SCENES", str(tmp_path))
    broken = base04()
    broken["bodies"][0]["params"]["section"] = {"type": "I", "b": 0.1, "h": 0.02, "tf": 0.02, "tw": 0.01}
    with TestClient(create_app(MockSimulation, "mock")) as client:
        r = client.post("/api/scene/save", json={"name": "x", "scene": broken})
        assert r.status_code == 422 and "flanges" in r.json()["detail"]
        assert client.post("/api/scene/save", json={"name": "ok", "scene": base04()}).status_code == 200
