"""Layouts built with the editor tools (Node, simulated pointer events) run correctly in the engine.

tests/frontend/export_scenes.mjs drives the real editor modules; here the result is validated
against the scene schema and simulated with the native engine, so a wrong support angle, a
swapped spring end or a bad local point shows up as wrong physics.
"""
import json
import math
import shutil
import subprocess
from pathlib import Path

import jsonschema
import pytest

from mechsim import scene as scene_module
from mechsim.sim import Simulation

REPO = Path(__file__).resolve().parents[2]
NODE = shutil.which("node")
G = 9.81

pytestmark = pytest.mark.skipif(NODE is None, reason="node is not installed")


@pytest.fixture(scope="module")
def scenes():
    out = subprocess.run(
        [NODE, str(REPO / "tests/frontend/export_scenes.mjs")], capture_output=True, text=True, check=True
    )
    return json.loads(out.stdout)


def run(scene, steps, sample=1):
    frames = []
    with Simulation(scene) as sim:
        frames.append(sim.frame())
        for _ in range(steps // sample):
            sim.step(n=sample)
            frames.append(sim.frame())
    return frames


def to_world(body, point):
    c, s = math.cos(body["phi"]), math.sin(body["phi"])
    return [body["x"] + c * point[0] - s * point[1], body["y"] + s * point[0] + c * point[1]]


@pytest.mark.parametrize("name", ["incline", "pendulum", "disc", "clamp", "hung", "chain"])
def test_exported_scene_is_valid(scenes, name):
    assert scene_module.validate_scene(scenes[name]) == []
    assert scenes[name]["version"] == "0.2"


@pytest.mark.native
@pytest.mark.parametrize("name", ["incline", "pendulum", "disc", "clamp", "hung", "chain"])
def test_exported_scene_runs_and_frames_are_valid(scenes, state_schema, name):
    for frame in run(scenes[name], 500, sample=100):
        jsonschema.validate(frame, state_schema)


@pytest.mark.native
def test_incline_block_stays_on_the_surface_line(scenes):
    s = scenes["incline"]
    surface = s["surfaces"][0]
    rollers = s["constraints"]
    assert [c["type"] for c in rollers] == ["roller_support"] * 2
    assert all(c["surface"] == surface["id"] for c in rollers)
    ux, uy = surface["p2"][0] - surface["p1"][0], surface["p2"][1] - surface["p1"][1]
    norm = math.hypot(ux, uy)
    assert math.degrees(math.atan2(uy, ux)) == pytest.approx(30.0, abs=1e-6)

    start = None
    for frame in run(s, 1500, sample=50):
        body = frame["bodies"][0]
        for roller in rollers:
            p = to_world(body, roller["point"])
            # distance of each supported point from the surface line stays zero
            dist = ((p[0] - surface["p1"][0]) * uy - (p[1] - surface["p1"][1]) * ux) / norm
            assert abs(dist) < 1e-4
        start = start or body
    assert math.dist((body["x"], body["y"]), (start["x"], start["y"])) > 0.05, "the block slides along the surface"
    assert body["phi"] == pytest.approx(math.pi / 6, abs=1e-4), "and does not tip over"


@pytest.mark.native
def test_pendulum_impulse_and_pin(scenes):
    s = scenes["pendulum"]
    rod = s["bodies"][0]
    m, w, h = rod["params"]["mass"], rod["params"]["width"], rod["params"]["height"]
    d = h / 2
    I_A = m * (w * w + h * h) / 12 + m * d * d
    omega0 = (1.0 * h) / I_A  # 1 N s at the lower end: lever arm h about the pivot
    frames = run(s, 3000, sample=10)
    assert frames[0]["bodies"][0]["omega"] == pytest.approx(omega0, rel=1e-6)
    pin = s["constraints"][0]
    assert pin["surface"] == "s1" and pin["params"]["angle"] == pytest.approx(math.pi)
    pivot = frames[0]["constraints"][0]["position"]
    assert pivot == pytest.approx([0.0, 0.0], abs=1e-9)
    phis = [f["bodies"][0]["phi"] for f in frames]
    assert max(phis) > 0.3 and min(phis) < -0.3, "it swings to both sides"
    for f in frames:  # the pin point never leaves the ceiling point
        p = to_world(f["bodies"][0], pin["point"])
        assert math.dist(p, pivot) < 2e-3


@pytest.mark.native
def test_flywheel_disc_with_ghost_spring_and_moment(scenes):
    s = scenes["disc"]
    spring = next(e for e in s["elements"] if e["type"] == "spring")
    assert spring["a"]["body"] is None, "ground end first"
    assert spring["params"]["rest_length"] == pytest.approx(0.5)
    k, m, r = spring["params"]["k"], s["bodies"][0]["params"]["mass"], s["bodies"][0]["params"]["radius"]
    assert (k, m, r) == (30, 1.5, 0.25)
    omega = math.sqrt(2 * k / m)
    frames = run(s, 4000)
    assert frames[0]["elements"][0]["force"] == pytest.approx(k * 0.3)  # starts in tension
    phi_eq = (-2.2 + r * k * 0.3) / (k * r * r)
    phis = [f["bodies"][0]["phi"] for f in frames]
    assert sum(phis) / len(phis) == pytest.approx(phi_eq, rel=0.06)
    ups = [i * 1e-3 for i in range(1, len(phis)) if phis[i - 1] < phi_eq <= phis[i]]
    assert (ups[-1] - ups[0]) / (len(ups) - 1) == pytest.approx(2 * math.pi / omega, rel=0.03)
    assert all(abs(f["bodies"][0]["x"]) < 1e-3 for f in frames), "the Festlager holds the centre"


@pytest.mark.native
def test_clamp_reaction_balances_weight_and_tip_load(scenes):
    s = scenes["clamp"]
    beam = s["bodies"][0]
    m, length = beam["params"]["mass"], beam["params"]["width"]
    frames = run(s, 500, sample=100)
    fx, fy, mz = frames[-1]["constraints"][0]["reaction"]
    tip_force = 4.0  # dragged 0.2 m down at 20 N/m... see tools: 0.2 / 0.05 N
    load = next(e for e in s["elements"] if e["type"] == "load")
    assert load["params"]["force"] == [0, -tip_force]
    assert fx == pytest.approx(0.0, abs=1e-6)
    assert fy == pytest.approx(m * G + tip_force, rel=1e-9)
    assert mz == pytest.approx(m * G * length / 2 + tip_force * length, rel=1e-9)


def _con(frame, cid):
    return next(c for c in frame["constraints"] if c["id"] == cid)


@pytest.mark.native
def test_hung_block_on_a_stab_and_a_rope(scenes):
    s = scenes["hung"]
    types = sorted(c["type"] for c in s["constraints"])
    assert types == ["pin_support", "pin_support", "rod", "rope"]
    assert all(c["body"] is None for c in s["constraints"] if c["type"] == "pin_support")
    rod = next(c for c in s["constraints"] if c["type"] == "rod")
    assert rod["a"] == {"body": None, "point": [0, 1.5]}, "the Stab hangs from the free-space Festlager"
    frames = run(s, 3000, sample=10)
    for f in frames:
        stab, rope = _con(f, "S1"), _con(f, "R1")
        assert math.dist(stab["p1"], stab["p2"]) == pytest.approx(stab["length"], abs=3e-3)
        assert math.dist(rope["p1"], rope["p2"]) <= rope["length"] + 3e-3
        assert rope["force"] >= -1e-6
    # the block hangs on the two: their vertical force components carry its weight (m = 1)
    last = frames[-1]
    y_forces = 0.0
    for cid in ("S1", "R1"):
        c = _con(last, cid)
        direction = [(c["p1"][i] - c["p2"][i]) / math.dist(c["p1"], c["p2"]) for i in range(2)]
        y_forces += c["force"] * direction[1]
    assert y_forces > 0


@pytest.mark.native
def test_chain_pinned_to_a_free_space_festlager_and_hinged(scenes):
    s = scenes["chain"]
    kinds = sorted(c["type"] for c in s["constraints"])
    assert kinds == ["pin_joint", "pin_support"]
    pin = next(c for c in s["constraints"] if c["type"] == "pin_support")
    assert pin["body"] == "m1", "the joint tool turned the free pin into a Festlager on the upper bar"
    frames = run(s, 3000, sample=10)
    joint = next(c for c in s["constraints"] if c["type"] == "pin_joint")
    for f in frames:
        bu = next(b for b in f["bodies"] if b["id"] == joint["a"]["body"])
        bl = next(b for b in f["bodies"] if b["id"] == joint["b"]["body"])
        pa, pb = to_world(bu, joint["a"]["point"]), to_world(bl, joint["b"]["point"])
        assert math.dist(pa, pb) < 6e-3  # first-order scheme
        assert math.dist(to_world(next(b for b in f["bodies"] if b["id"] == pin["body"]), pin["point"]), [0.0, 1.5]) < 6e-3
    angles = [f["bodies"][1]["phi"] - f["bodies"][0]["phi"] for f in frames]
    assert max(angles) - min(angles) > 0.1, "the bars swing against each other"
