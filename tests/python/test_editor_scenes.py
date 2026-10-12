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
import numpy as np
import pytest

from mechsim import scene as scene_module
from mechsim.analysis import truss
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


V04 = ["fachwerk", "fachwerkElastic", "cantileverBeam", "forced"]


@pytest.mark.parametrize("name", ["incline", "pendulum", "disc", "clamp", "hung", "chain", "gap", "damped", *V04])
def test_exported_scene_is_valid(scenes, name):
    assert scene_module.validate_scene(scenes[name]) == []
    assert scenes[name]["version"] == "0.4"


@pytest.mark.native
@pytest.mark.parametrize("name", ["incline", "pendulum", "disc", "clamp", "hung", "chain", "gap", "damped", *V04])
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


@pytest.mark.native
def test_loslager_placed_with_a_gap_holds_the_mass_like_a_touching_one(scenes):
    s = scenes["gap"]
    rollers = s["constraints"]
    assert [c["type"] for c in rollers] == ["roller_support"] * 2
    assert all(c["surface"] == "s1" and c["params"]["angle"] == 0 for c in rollers)
    block = s["bodies"][0]
    y0 = block["position"][1]
    frames = run(s, 1000, sample=100)
    for f in frames:
        assert f["bodies"][0]["y"] == pytest.approx(y0, abs=1e-6), "held 0.5 m above the floor"
    m = block["params"]["mass"]
    total = sum(c["reaction"][1] for c in frames[-1]["constraints"])
    assert total == pytest.approx(m * G, rel=1e-6)


@pytest.mark.native
def test_damper_made_with_the_tool_gives_terminal_velocity(scenes):
    s = scenes["damped"]
    damper = s["elements"][0]
    assert damper["type"] == "damper" and damper["params"]["c"] == 10
    m = s["bodies"][0]["params"]["mass"]
    frames = run(s, 2000, sample=100)
    assert frames[-1]["bodies"][0]["vy"] == pytest.approx(-m * G / 10, rel=2e-3)
    assert frames[-1]["elements"][0]["force"] == pytest.approx(m * G, rel=2e-3)


# --- v0.4: Fachwerk, beam, forced vibration ---------------------------------------------------------


@pytest.mark.native
def test_fachwerk_member_forces_equal_the_method_of_joints(scenes):
    scene = scenes["fachwerk"]
    expected = truss.joint_forces(scene)  # raises unless statically determinate: 2 j = 7 members + 3 reactions
    assert len(expected) == 7
    with Simulation(scene) as sim:
        sim.step(n=3)
        frame = sim.frame()
    forces = {c["id"]: c["force"] for c in frame["constraints"] if c["type"] == "rod"}
    for sid, value in expected.items():
        assert forces[sid] == pytest.approx(value, rel=1e-4, abs=1e-3), sid
    # the load is carried: the vertical reactions add up to the load and the node weights
    reactions = sum(c["reaction"][1] for c in frame["constraints"] if c["type"] in ("pin_support", "roller_support"))
    assert reactions == pytest.approx(1000 + 5 * 1.0 * G, rel=1e-5)
    assert [b["id"] for b in frame["bodies"]] == ["N1", "N2", "N3", "N4", "N5"]
    # a determinate truss at rest stays at rest: the nodes do not move
    with Simulation(scene) as sim:
        sim.step(n=2000)
        later = sim.frame()
    for before, after in zip(frame["bodies"], later["bodies"]):
        assert (after["x"], after["y"]) == pytest.approx((before["x"], before["y"]), abs=1e-6)


@pytest.mark.native
def test_elastic_fachwerk_with_a_redundant_bar_matches_the_stiffness_method(scenes):
    scene = scenes["fachwerkElastic"]
    assert len([e for e in scene["elements"] if e["type"] == "bar"]) == 8  # one more than a determinate truss needs
    with pytest.raises(ValueError):
        truss.joint_forces(scene)  # statics alone cannot do it
    expected = truss.stiffness_forces(scene)
    # the bars start unstressed and oscillate about the static solution: the mean force over a few
    # thousand steps is the static force
    sums = {k: 0.0 for k in expected}
    n = 3000
    with Simulation(scene) as sim:
        for _ in range(n):
            sim.step()
            for e in sim.frame()["elements"]:
                if e["type"] == "bar":
                    sums[e["id"]] += e["force"]
    for k, v in expected.items():
        assert sums[k] / n == pytest.approx(v, rel=0.03, abs=2.0), k
    assert min(expected.values()) < 0 < max(expected.values())  # tension and compression


@pytest.mark.native
def test_beam_drawn_with_the_tool_bends_like_euler_bernoulli(scenes):
    scene = scenes["cantileverBeam"]
    beam = scene["bodies"][0]
    assert beam["params"]["length"] == 2 and beam["params"]["section"] == {"type": "square", "a": 0.01}
    EI = 210e9 * 0.01**4 / 12
    L, P = 2.0, 2.0
    m_beam = 7850 * 0.01**2 * L
    q = m_beam * G / L  # the beam's own weight per metre
    # tip load + self weight of a cantilever: P L^3 / 3 EI + q L^4 / 8 EI
    static = P * L**3 / (3 * EI) + q * L**4 / (8 * EI)
    omega = math.sqrt(3 * EI / (L**3 * (33 / 140 * m_beam)))  # first mode (Rayleigh: 33/140 of the mass at the tip)
    period = 2 * math.pi / omega
    tips = []
    with Simulation(scene) as sim:
        steps = int(8 * period / 1e-3)
        for _ in range(steps):
            sim.step()
            tips.append(sim.frame()["bodies"][0]["nodes"][-1][1])
        final = sim.frame()["bodies"][0]
    # starting from rest, the tip swings between 0 and twice the static deflection
    assert -min(tips) == pytest.approx(2 * static, rel=0.06)
    assert max(tips) == pytest.approx(0.0, abs=0.01 * static)
    # and its mean is the static deflection (whole periods)
    assert -np.mean(tips) == pytest.approx(static, rel=0.05)
    # the engine frame carries what the editor needs to draw it
    assert len(final["nodes"]) == 9 and final["stress"] > 0


@pytest.mark.native
def test_forced_vibration_reaches_the_steady_state_amplitude(scenes):
    scene = scenes["forced"]
    m, k, c, F0, f = 2.0, 200.0, 8.0, 5.0, 1.5
    Omega = 2 * math.pi * f
    expected = F0 / math.hypot(k - m * Omega**2, c * Omega)  # |X| of m x'' + c x' + k x = F0 sin(Omega t)
    ys = []
    with Simulation(scene) as sim:
        for _ in range(16000):  # 16 s: the transient decays like exp(-zeta omega0 t) = exp(-2 t)
            sim.step()
            ys.append(sim.frame()["bodies"][0]["y"])
    tail = np.array(ys[-int(4 / f / 1e-3 * 2):])  # the last two periods... of the excitation (4/f is plenty)
    amplitude = (tail.max() - tail.min()) / 2
    assert amplitude == pytest.approx(expected, rel=0.03)
    # the load is shown with its instantaneous value
    with Simulation(scene) as sim:
        sim.step(n=100)  # t = 0.1 s
        load = next(e for e in sim.frame()["elements"] if e["type"] == "load")
    assert load["mode"] == "harmonic" and load["force"] == pytest.approx(F0)
    assert load["vector"][1] == pytest.approx(F0 * math.sin(Omega * 0.1), abs=0.05)
