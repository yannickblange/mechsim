"""v0.7b: a Stab on a block or a disc is clamped there (an Einspannung), unless it says hinged. The Kreis-Feder example."""
from __future__ import annotations

import copy
import math

import numpy as np
import pytest

from mechsim.scene import validate_scene
from mechsim.sim import Simulation

pytestmark = pytest.mark.native

R, ARM, K = 0.9, 2.0, 100.0  # disc radius, node distance from the centre, spring stiffness
M_DISC, M_NODE = 1.0, 1.0


def kreis_feder(hinged: bool = False):
    """A disc on a Festlager at its centre; two rigid Stabs from its rim to two nodes, each held by a vertical spring."""
    params = {"hinged_a": True} if hinged else {}
    return {
        "version": "0.4", "gravity": [0, -9.81], "solver": {"dt": 0.001},
        "surfaces": [{"id": "s1", "p1": [2.45, 1.55], "p2": [1.45, 1.55]}, {"id": "s2", "p1": [-2.6, 0.3], "p2": [-1.6, 0.3]}],
        "bodies": [
            {"id": "m1", "type": "disc", "position": [0, 1], "angle": 0, "params": {"mass": M_DISC, "radius": R}},
            {"id": "N1", "type": "node", "position": [ARM, 1], "angle": 0, "params": {"mass": M_NODE}},
            {"id": "N2", "type": "node", "position": [-ARM, 1], "angle": 0, "params": {"mass": M_NODE}},
        ],
        "elements": [
            {"id": "k1", "type": "spring", "a": {"body": None, "point": [-2, 0.3]}, "b": {"body": "N2", "point": [0, 0]},
             "params": {"k": K, "rest_length": 1.15}},
            {"id": "k2", "type": "spring", "a": {"body": None, "point": [2, 1.55]}, "b": {"body": "N1", "point": [0, 0]},
             "params": {"k": K, "rest_length": 1.05}},
        ],
        "constraints": [
            {"id": "A1", "type": "pin_support", "body": "m1", "point": [0, 0], "surface": None, "params": {"angle": 0}},
            {"id": "S1", "type": "rod", "a": {"body": "m1", "point": [R, 0]}, "b": {"body": "N1", "point": [0, 0]}, "params": dict(params)},
            {"id": "S2", "type": "rod", "a": {"body": "m1", "point": [-R, 0]}, "b": {"body": "N2", "point": [0, 0]}, "params": dict(params)},
        ],
    }


def run(scene, seconds):
    t, phi, bodies = [], [], []
    with Simulation(scene) as sim:
        for _ in range(int(seconds / sim.dt)):
            sim.step(n=1)
            f = sim.frame()
            b = {x["id"]: x for x in f["bodies"]}
            t.append(f["t"])
            phi.append(b["m1"]["phi"])
            bodies.append(b)
    return np.array(t), np.array(phi), bodies


def test_the_scene_is_valid_with_and_without_hinges():
    assert validate_scene(kreis_feder()) == []
    assert validate_scene(kreis_feder(hinged=True)) == []


def test_the_clamped_stabs_carry_the_disc_round_with_the_springs_torque():
    t, phi, bodies = run(kreis_feder(), 3.0)
    assert np.ptp(phi) > 0.4  # the springs turn the disc and its arms: they swing about the equilibrium
    for b in bodies[::100]:
        # the nodes sit at the tips of the arms: distance ARM from the centre, direction = the disc's rotation
        for node, sign in (("N1", 1), ("N2", -1)):
            dx, dy = b[node]["x"] - b["m1"]["x"], b[node]["y"] - b["m1"]["y"]
            assert math.hypot(dx, dy) == pytest.approx(ARM, abs=5e-3)
            angle = math.atan2(sign * dy, sign * dx)
            assert angle == pytest.approx(b["m1"]["phi"], abs=5e-3)
    # small torque equilibrium: the oscillation period of the nonlinear system is about 2 pi / sqrt(2 k L^2 / (J + 2 m L^2))
    J = 0.5 * M_DISC * R**2
    omega = math.sqrt(2 * K * ARM**2 / (J + 2 * M_NODE * ARM**2))
    ups = [t[i] for i in range(1, len(phi)) if phi[i - 1] < phi[:].mean() <= phi[i]]
    assert len(ups) >= 3
    assert np.diff(ups).mean() == pytest.approx(2 * math.pi / omega, rel=0.2)


def test_hinged_stabs_let_the_nodes_turn_against_the_disc():
    _, _, bodies = run(kreis_feder(hinged=True), 2.0)
    # pins at the rim: the node is only held at the rod's length, so its direction is no longer the disc's rotation
    worst = max(
        abs(math.atan2(b["N1"]["y"] - b["m1"]["y"], b["N1"]["x"] - b["m1"]["x"]) - b["m1"]["phi"]) for b in bodies
    )
    assert worst > 0.05


# --- v0.7c: a rigid Stab on a node with an Einspannung is a rigid cantilever -----------------------------------

def mast(clamped: bool):
    """A rigid Stab of length 1 m from a floor node to a free node with 500 N sideways; the floor node has an Einspannung
    (clamped) or a Festlager."""
    support = "fixed_support" if clamped else "pin_support"
    return {
        "version": "0.4", "gravity": [0, -9.81], "solver": {"dt": 0.001},
        "bodies": [
            {"id": "N1", "type": "node", "position": [0, 0], "angle": 0, "params": {"mass": 1.0}},
            {"id": "N2", "type": "node", "position": [0, 1], "angle": 0, "params": {"mass": 1.0}},
        ],
        "elements": [{"id": "F1", "type": "load", "body": "N2", "point": [0, 0], "params": {"force": [-500, 0], "moment": 0, "mode": "constant"}}],
        "constraints": [
            {"id": "E1", "type": support, "body": "N1", "point": [0, 0], "surface": None, "params": {"angle": 0}},
            {"id": "S1", "type": "rod", "a": {"body": "N1", "point": [0, 0]}, "b": {"body": "N2", "point": [0, 0]}, "params": {}},
        ],
    }


def test_a_rigid_stab_on_an_einspannung_holds_its_tip_and_the_support_carries_the_moment():
    with Simulation(mast(True)) as sim:
        sim.step(n=1500)
        f = sim.frame()
    n2 = next(b for b in f["bodies"] if b["id"] == "N2")
    assert n2["x"] == pytest.approx(0.0, abs=2e-3) and n2["y"] == pytest.approx(1.0, abs=2e-3)  # a rigid arm: it does not bend or swing
    e1 = next(c for c in f["constraints"] if c["id"] == "E1")
    assert e1["reaction"][0] == pytest.approx(500.0, abs=1.0)  # the load, sideways
    assert e1["reaction"][2] == pytest.approx(-500.0 * 1.0, abs=2.0)  # F L: the load to the left on a 1 m arm


def test_a_rigid_stab_on_a_festlager_is_still_a_pin_and_falls_over():
    with Simulation(mast(False)) as sim:
        sim.step(n=1500)
        n2 = next(b for b in sim.frame()["bodies"] if b["id"] == "N2")
    assert n2["x"] < -0.5  # swung out to the left: a pendulum, nothing keeps its angle
