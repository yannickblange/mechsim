"""v0.7: an Einspannung (fixed_support) on the node at the end of an elastic Stab clamps it (Euler's case 3)."""
from __future__ import annotations

import math

import pytest

from mechsim.sim import Simulation

pytestmark = pytest.mark.native

E_MOD = 210e9


def column(clamped: bool, P: float, L: float = 2.0, a: float = 0.04):
    """The "Knick Fall": a square steel column on the ground, a node at its top that a Loslager holds sideways (it
    slides on a vertical wall), the load P pressing down. `clamped`: Einspannung or Festlager at the foot."""
    return {
        "version": "0.4",
        "gravity": [0, -9.81],
        "solver": {"dt": 0.001},
        "surfaces": [{"id": "s1", "p1": [-1, 0], "p2": [1, 0]}, {"id": "s2", "p1": [-0.3, 2.3], "p2": [-0.3, 1.3]}],
        "bodies": [
            {"id": "N1", "type": "node", "position": [0, 0], "angle": 0, "params": {"mass": 1, "damping": 8}},
            {"id": "N2", "type": "node", "position": [0, L], "angle": 0, "params": {"mass": 1, "damping": 8}},
        ],
        "elements": [
            {"id": "S1", "type": "bar", "a": {"body": "N1", "point": [0, 0]}, "b": {"body": "N2", "point": [0, 0]},
             "params": {"section": {"type": "square", "a": a}, "damping": 8, "segments": 8}},
            {"id": "F1", "type": "load", "body": "N2", "point": [0, 0], "params": {"force": [0, -P], "mode": "constant"}},
        ],
        "constraints": [
            {"id": "E1", "type": "fixed_support" if clamped else "pin_support", "body": "N1", "point": [0, 0],
             "surface": "s1", "params": {"angle": 0}},
            {"id": "B1", "type": "roller_support", "body": "N2", "point": [0, 0], "surface": "s2", "params": {"angle": -math.pi / 2}},
        ],
    }


def lateral(scene, seconds=8.0):
    with Simulation(scene) as sim:
        sim.step(n=int(seconds / sim.dt))
        frame = sim.frame()
    bar = next(e for e in frame["elements"] if e["id"] == "S1")
    return max(abs(n[0]) for n in bar["nodes"]), bar


def test_clamped_foot_carries_what_a_hinged_foot_cannot():
    L, a = 2.0, 0.04
    EI = E_MOD * a**4 / 12
    p_pinned = math.pi**2 * EI / L**2
    p_clamped = p_pinned / 0.6991546**2  # Euler's case 3: clamped - pinned
    assert p_clamped / p_pinned == pytest.approx(2.046, rel=1e-3)

    load = 1.36 * p_pinned  # 150 kN, the Knick Fall: far above the pinned and well below the clamped Euler load
    hinged, bar_h = lateral(column(False, load))
    clamped, bar_c = lateral(column(True, load))
    assert hinged > 0.3  # the pinned column has buckled (the foot turned)
    assert clamped < 1e-3  # the clamped one stands
    assert bar_h["pcr"] == pytest.approx(p_pinned, rel=1e-9)
    assert bar_c["pcr"] == pytest.approx(p_clamped, rel=1e-6)  # the label reports the Euler load of its case

    # ... until the clamped Euler load: 1.1 x buckles it, and the foot still does not turn
    over, _ = lateral(column(True, 1.1 * p_clamped))
    assert over > 0.3


def test_the_foot_of_a_clamped_column_does_not_turn_but_carries_a_moment_when_it_bends():
    L, a = 2.0, 0.04
    p_clamped = math.pi**2 * E_MOD * a**4 / 12 / (0.6991546 * L) ** 2
    with Simulation(column(True, 1.1 * p_clamped)) as sim:
        sim.step(n=8000)
        frame = sim.frame()
    foot = next(b for b in frame["bodies"] if b["id"] == "N1")
    assert abs(foot["phi"]) < 1e-3
    bar = next(e for e in frame["elements"] if e["id"] == "S1")
    assert abs(bar["nodes"][1][2]) > 0.02  # the section next to the foot has turned against the foot
    moment = next(c for c in frame["constraints"] if c["id"] == "E1")["reaction"][2]
    assert abs(moment) > 100  # N m


def test_a_clamped_cantilever_stab_deflects_like_a_beam():
    L, a, P = 1.0, 0.02, 20.0
    scene = {
        "version": "0.4", "gravity": [0, 0], "solver": {"dt": 0.001},
        "bodies": [
            {"id": "N0", "type": "node", "position": [0, 0], "angle": 0, "params": {"mass": 1, "damping": 8}},
            {"id": "N", "type": "node", "position": [0, L], "angle": 0, "params": {"mass": 1, "damping": 8}},
        ],
        "elements": [
            {"id": "B", "type": "bar", "a": {"body": "N0", "point": [0, 0]}, "b": {"body": "N", "point": [0, 0]},
             "params": {"section": {"type": "square", "a": a}, "damping": 8, "segments": 8}},
            {"id": "F", "type": "load", "body": "N", "point": [0, 0], "params": {"force": [P, 0]}},
        ],
        "constraints": [{"id": "E", "type": "fixed_support", "body": "N0", "point": [0, 0], "surface": None, "params": {"angle": 0}}],
    }
    with Simulation(scene) as sim:
        sim.step(n=6000)
        top = next(b for b in sim.frame()["bodies"] if b["id"] == "N")
    assert top["x"] == pytest.approx(P * L**3 / (3 * E_MOD * a**4 / 12), rel=0.02)
