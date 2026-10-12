"""v0.4 in the native engine through the Python binding: frames, body order, errors."""
from __future__ import annotations

import copy
import math

import jsonschema
import numpy as np
import pytest

from mechsim.sim import Simulation
from scene_factory import base04

pytestmark = pytest.mark.native


def test_every_v04_type_runs_and_frames_match_the_schema(state_schema):
    with Simulation(base04()) as sim:
        for _ in range(300):
            sim.step(n=10)
            frame = sim.frame()
            jsonschema.validate(frame, state_schema)
            assert all(math.isfinite(b["x"]) and math.isfinite(b["y"]) for b in frame["bodies"])
    ids = [b["id"] for b in frame["bodies"]]
    assert ids == ["beam", "N1", "N2", "N3"]  # scene order; the beam's hidden nodes are not bodies
    assert [e["id"] for e in frame["elements"]] == ["B1", "B2", "F1", "F2", "k1"]  # no finite elements
    beam = frame["bodies"][0]
    assert len(beam["nodes"]) >= 9 and len(beam["moments"]) == len(beam["nodes"])
    assert beam["EI"] == pytest.approx(210e9 * 0.01**4 / 12)
    assert beam["A"] == pytest.approx(1e-4)
    types = {e["id"]: e["type"] for e in frame["elements"]}
    assert types["B1"] == "bar" and "stress" in next(e for e in frame["elements"] if e["id"] == "B1")


def test_state_reports_a_beam_once_in_scene_order():
    scene = base04()
    with Simulation(scene) as sim:
        sim.step(n=50)
        state = sim.state()
        frame = sim.frame()
        assert sim.body_count == 4 and state.shape == (4, 6)
        for row, body in zip(state, frame["bodies"]):
            assert row[:3] == pytest.approx([body["x"], body["y"], body["phi"]])
            assert row[3:] == pytest.approx([body["vx"], body["vy"], body["omega"]])
        trace = sim.step_traced(5)
        assert trace["ids"] == ["beam", "N1", "N2", "N3"]


def test_reset_restores_the_beam_and_the_nodes():
    with Simulation(base04()) as sim:
        first = sim.frame()
        sim.step(n=500)
        assert sim.frame()["bodies"][0]["nodes"] != first["bodies"][0]["nodes"]
        sim.reset()
        assert sim.frame()["bodies"][0]["nodes"] == first["bodies"][0]["nodes"]
        assert sim.time == 0.0


def test_a_beam_attachment_outside_the_beam_is_reported_with_the_beam_id():
    broken = copy.deepcopy(base04())
    broken["elements"][4]["b"]["point"] = [0.7, 0.0]
    with pytest.raises(Exception, match="beam"):
        Simulation(broken)


def test_the_engine_names_the_object_with_a_bad_section():
    broken = copy.deepcopy(base04())
    broken["elements"][0]["params"]["section"] = {"type": "I", "b": 0.1, "h": 0.02, "tf": 0.02, "tw": 0.01}
    with pytest.raises(Exception, match="bar 'B1'.*flanges"):
        Simulation(broken)
    broken = copy.deepcopy(base04())
    broken["bodies"][0]["params"]["section"] = {"type": "T", "b": 0.1, "h": 0.1, "tf": 0.2, "tw": 0.01}
    with pytest.raises(Exception, match="beam 'beam'"):
        Simulation(broken)
