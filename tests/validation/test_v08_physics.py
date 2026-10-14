"""v0.8: blocks and discs collide with surfaces (friction, restitution, curved surfaces). Textbook results and robustness."""
from __future__ import annotations

import copy
import math
import random

import jsonschema
import pytest

from mechsim.scene import validate_scene
from mechsim.sim import Simulation

pytestmark = pytest.mark.native

G = 9.81


def scene(bodies, surfaces, elements=(), constraints=()):
    return {"version": "0.4", "gravity": [0, -G], "solver": {"dt": 0.001}, "surfaces": list(surfaces), "bodies": list(bodies),
            "elements": list(elements), "constraints": list(constraints)}


def block(id, x, y, w=0.4, h=0.2, m=2.0, phi=0.0, vel=(0, 0), omega=0.0):
    return {"id": id, "type": "block", "position": [x, y], "angle": phi, "velocity": list(vel), "omega": omega,
            "params": {"mass": m, "width": w, "height": h}}


def disc(id, x, y, r=0.1, m=1.0, vel=(0, 0), omega=0.0):
    return {"id": id, "type": "disc", "position": [x, y], "angle": 0, "velocity": list(vel), "omega": omega,
            "params": {"mass": m, "radius": r}}


def floor(mu=0.0, e=0.0, id="f"):
    return {"id": id, "p1": [-5, 0], "p2": [5, 0], "friction": mu, "restitution": e}


def run(sc, seconds, every=None):
    frames = []
    with Simulation(sc) as sim:
        for i in range(int(seconds / 0.001)):
            sim.step(n=1)
            if every and (i + 1) % every == 0:
                frames.append(sim.frame())
        return sim.frame(), frames


def bowl(R, n=180, mu=0.0):
    """Half a circle below the x axis, the free side inside (the line runs left to right along the bottom)."""
    pts = [[R * math.cos(math.pi + math.pi * k / n), R * math.sin(math.pi + math.pi * k / n)] for k in range(n + 1)]
    return {"id": "bowl", "p1": pts[0], "p2": pts[-1], "points": pts, "friction": mu}


def dome(R, n=180):
    """Half a circle above the x axis, the free side outside."""
    pts = [[R * math.cos(math.pi - math.pi * k / n), R * math.sin(math.pi - math.pi * k / n)] for k in range(n + 1)]
    return {"id": "dome", "p1": pts[0], "p2": pts[-1], "points": pts}


def test_the_new_surface_fields_validate_and_bad_ones_are_refused():
    sc = scene([block("b", 0, 1)], [{"id": "s", "p1": [0, 0], "p2": [1, 0], "friction": 0.3, "restitution": 0.5, "shape": "spline",
                                    "control": [[0, 0], [0.5, 0.1], [1, 0]], "points": [[0, 0], [0.5, 0.1], [1, 0]]}])
    assert validate_scene(sc) == []
    for field, value in (("friction", -0.1), ("restitution", 1.2), ("shape", "wave"), ("points", [[0, 0]])):
        bad = copy.deepcopy(sc)
        bad["surfaces"][0][field] = value
        assert validate_scene(bad), field


def test_frames_with_contacts_match_the_state_schema(state_schema):
    frame, _ = run(scene([block("b", 0, 0.1)], [floor(0.2)]), 0.2)
    assert len(frame["contacts"]) == 2
    jsonschema.validate(frame, state_schema)
    free, _ = run(scene([block("b", 0, 3)], [floor()]), 0.1)
    assert "contacts" not in free  # nothing touches: the frame is the one of v0.7
    jsonschema.validate(free, state_schema)


def test_a_resting_block_pushes_with_its_weight_and_a_pushed_one_tips_over_a_table_edge():
    frame, _ = run(scene([block("b", 0, 0.1)], [floor()]), 1.0)
    assert sum(c["normal_force"] for c in frame["contacts"]) == pytest.approx(2.0 * G, rel=1e-9)
    # a block slides off the end of a table, tips over the edge and lands on the ground below (it never falls through the table)
    table = {"id": "tab", "p1": [-2, 0], "p2": [0, 0], "friction": 0.1}
    ground = {"id": "ground", "p1": [-5, -1], "p2": [5, -1], "friction": 0.3}
    frame, frames = run(scene([block("b", -0.5, 0.1, vel=(1.5, 0))], [table, ground]), 3.0, every=10)
    assert min(f["bodies"][0]["y"] for f in frames) > -0.9 - 1e-3  # not below the ground (centre at least 0.1 above it)
    assert all(f["bodies"][0]["y"] > 0.1 - 1e-3 or f["bodies"][0]["x"] > -0.2 for f in frames)  # on the table until it leaves the edge
    final = frame["bodies"][0]
    assert final["y"] < -0.7 and final["x"] > 0.0
    assert abs(final["vx"]) + abs(final["vy"]) < 1e-3


def test_coulomb_friction_oscillator_loses_2_mu_m_g_over_k_per_half_cycle():
    m, k, mu = 2.0, 200.0, 0.2
    sc = scene([block("b", 0.8, 0.1, m=m)], [floor(mu)], elements=[
        {"id": "k1", "type": "spring", "a": {"body": None, "point": [-1.0, 0.1]}, "b": {"body": "b", "point": [0, 0]}, "params": {"k": k, "rest_length": 1.5}}])
    _, frames = run(sc, 5.0, every=1)
    xs = [f["bodies"][0]["x"] - 0.5 for f in frames]  # the spring is relaxed at x = 0.5
    turns = [xs[i] for i in range(1, len(xs) - 1) if (xs[i] - xs[i - 1]) * (xs[i + 1] - xs[i]) <= 0 and abs(xs[i]) > 1e-4]
    drop = 2 * mu * m * G / k
    assert len(turns) >= 6
    for j, t in enumerate(turns[:6]):
        assert abs(t) == pytest.approx(0.3 - drop * (j + 1), abs=2e-3)
    assert abs(xs[-1]) < mu * m * G / k + 1e-3  # it stops inside the band where the spring cannot overcome the friction


@pytest.mark.parametrize("n, tol", [(180, 0.01)])
def test_a_disc_in_a_bowl_swings_with_the_period_of_a_pendulum(n, tol):
    R, r, a0 = 1.0, 0.1, 0.15
    c = R - r
    for mu, factor in ((0.0, 1.0), (1.0, 1.5)):  # sliding: a particle on a circle; rolling: 1 + J / (m r^2) = 3/2
        sc = scene([disc("d", -c * math.sin(a0), -c * math.cos(a0), r)], [bowl(R, n, mu)])
        _, frames = run(sc, 6.0, every=1)
        xs = [f["bodies"][0]["x"] for f in frames]
        up = [i for i in range(1, len(xs)) if xs[i - 1] < 0 <= xs[i]]
        period = (up[-1] - up[0]) / (len(up) - 1) * 0.001
        assert period == pytest.approx(2 * math.pi * math.sqrt(factor * c / G), rel=tol)
        assert max(xs[-1500:]) > 0.9 * max(xs[:1500])  # little energy is lost at the corners of the polyline


def test_a_disc_on_a_dome_presses_with_m_g_3cos_minus_2_and_leaves_at_48_degrees():
    Rd, rr = 2.0, 0.05
    _, frames = run(scene([disc("d", 0.0, Rd + rr, rr, vel=(0.02, 0.0))], [dome(Rd)]), 3.0, every=1)
    by_angle = {}
    for f in frames:
        b = f["bodies"][0]
        by_angle.setdefault(int(math.degrees(math.atan2(b["x"], b["y"])) // 5) * 5, []).append(sum(c["normal_force"] for c in f.get("contacts", [])))
    for a in (5, 10, 20, 30):
        mean = sum(by_angle[a]) / len(by_angle[a])
        assert mean == pytest.approx(G * (3 * math.cos(math.radians(a + 2.5)) - 2), rel=0.03), a
    assert sum(by_angle[50]) == 0.0  # it has left the dome by 50 degrees: acos(2/3) = 48.2


def test_a_heap_of_masses_in_a_bowl_stays_finite_and_on_the_surface():
    random.seed(1)
    bodies = []
    for i in range(6):
        bodies.append(block("b%d" % i, random.uniform(-0.5, 0.5), random.uniform(0.2, 1.5), random.uniform(0.1, 0.3), random.uniform(0.05, 0.2), 1.0,
                            phi=random.uniform(-1, 1), vel=(random.uniform(-1, 1), 0), omega=random.uniform(-3, 3)))
        bodies.append(disc("d%d" % i, random.uniform(-0.5, 0.5), random.uniform(0.2, 1.5), random.uniform(0.04, 0.1), 1.0,
                           vel=(random.uniform(-1, 1), 0), omega=random.uniform(-3, 3)))
    surf = bowl(1.0)
    surf.update(friction=0.4, restitution=0.3)
    deepest, e_max = 0.0, -1e9
    with Simulation(scene(bodies, [surf])) as sim:
        for i in range(8000):
            sim.step(n=1)
            if i % 20 == 0:
                f = sim.frame()
                deepest = min([deepest] + [c["gap"] for c in f.get("contacts", [])])
                assert all(math.isfinite(b[k]) for b in f["bodies"] for k in ("x", "y", "phi", "vx", "vy", "omega"))
                e_max = max(e_max, f["energy"]["kinetic"] + f["energy"]["potential"])
        e_end = sim.frame()["energy"]
    assert deepest > -2e-3  # penetration stays a fraction of a millimetre
    assert e_end["kinetic"] + e_end["potential"] < e_max  # friction and impacts only take energy out
