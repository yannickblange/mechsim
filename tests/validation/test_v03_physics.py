"""v0.3 components against closed-form or independently integrated results."""
import copy
import math

import pytest

from mechsim.sim import Simulation

pytestmark = pytest.mark.native

G = 9.81


def run(scene, steps, sample=1):
    frames = []
    with Simulation(scene) as sim:
        frames.append(sim.frame())
        for _ in range(steps // sample):
            sim.step(n=sample)
            frames.append(sim.frame())
    return frames


def con(frame, cid):
    return next(c for c in frame["constraints"] if c["id"] == cid)


# --- Stab (rod) ---------------------------------------------------------------------------------


def test_rod_truss_static_forces(load_example):
    s = load_example("rod_truss")
    s["bodies"][0].pop("velocity")
    s["bodies"][0].pop("omega")
    m = s["bodies"][0]["params"]["mass"]
    cos_theta = 0.9 / math.hypot(0.3, 0.9)  # rods from (+-0.5, 1.5) to (+-0.2, 0.6)
    expected = m * G / (2 * cos_theta)
    for frame in run(s, 1000, sample=100)[1:]:
        assert con(frame, "D1")["force"] == pytest.approx(expected, rel=1e-3)
        assert con(frame, "D2")["force"] == pytest.approx(expected, rel=1e-3)
        body = frame["bodies"][0]
        assert (body["x"], body["y"], body["phi"]) == pytest.approx((0.0, 0.5, 0.0), abs=1e-6)


def test_rod_truss_swings_with_constant_rod_lengths(load_example):
    s = load_example("rod_truss")
    frames = run(s, 3000, sample=10)
    for f in frames:
        for cid in ("D1", "D2"):
            c = con(f, cid)
            assert math.dist(c["p1"], c["p2"]) == pytest.approx(c["length"], abs=2e-3)
    xs = [f["bodies"][0]["x"] for f in frames]
    assert max(xs) > 0.05 and min(xs) < -0.05, "it swings to both sides"
    forces = [con(f, "D1")["force"] for f in frames]
    assert max(forces) - min(forces) > 2.0, "the rod forces change while it swings"


def test_a_rod_reports_compression_as_negative_force():
    scene = {
        "version": "0.3", "gravity": [0, 0], "solver": {"dt": 0.001},
        "bodies": [{"id": "m", "type": "block", "position": [1, 0], "params": {"mass": 1, "width": 0.2, "height": 0.2}}],
        "elements": [{"id": "F", "type": "load", "body": "m", "point": [0, 0], "params": {"force": [-7, 0]}}],
        "constraints": [{"id": "D", "type": "rod", "a": {"body": None, "point": [0, 0]}, "b": {"body": "m", "point": [0, 0]},
                         "params": {"hinged_b": True}}],
    }
    frame = run(scene, 300, sample=100)[-1]
    assert con(frame, "D")["force"] == pytest.approx(-7.0, abs=1e-6)
    assert con(frame, "D")["reaction"] == pytest.approx([7.0, 0.0], abs=1e-6)  # on the mass, pointing away from the pin


# --- rope ---------------------------------------------------------------------------------------


def test_rope_catch_snap_time_energy_loss_and_hanging(load_example):
    s = load_example("rope_catch")
    frames = run(s, 4000)
    m = 1.0
    drop = 1.2 - (1.5 - math.sqrt(1.0 - 0.7**2))
    t_snap = math.sqrt(2 * drop / G)
    first_taut = next(f for f in frames if con(f, "R")["taut"])
    assert first_taut["t"] == pytest.approx(t_snap, abs=0.004)
    assert all(not con(f, "R")["taut"] for f in frames if f["t"] < t_snap - 0.01)
    assert all(con(f, "R")["force"] == 0.0 for f in frames if f["t"] < t_snap - 0.01)

    def energy(f):
        return f["energy"]["kinetic"] + f["energy"]["potential"]

    before = max(energy(f) for f in frames if f["t"] < t_snap - 0.01)
    after = energy(next(f for f in frames if f["t"] > t_snap + 0.02))
    # the radial velocity component v_r at the snap is lost: dE = m v_r^2 / 2
    v_r = G * t_snap * math.sqrt(1.0 - 0.49) * 1.0  # |v| = g t, radial unit vector (0.7, -0.714)
    v_r = G * t_snap * 0.714142842
    assert before - after == pytest.approx(0.5 * m * v_r**2, rel=0.03)

    # afterwards: tension only, never longer than the rope, never increasing energy
    later = [f for f in frames if f["t"] > t_snap + 0.02]
    assert all(con(f, "R")["force"] >= -1e-6 for f in later)
    assert all(math.dist(con(f, "R")["p1"], con(f, "R")["p2"]) <= 1.0 + 0.01 for f in later)
    # the snap loses energy and the slow first-order drift of the swing never gets it back
    assert max(energy(f) for f in later) < before - 0.5 * (before - after)


def test_rope_swing_matches_the_rod_while_taut():
    def pendulum(kind):
        return {
            "version": "0.3", "solver": {"dt": 0.001},
            "bodies": [{"id": "m", "type": "block", "position": [math.sin(0.4), 1.5 - math.cos(0.4)],
                        "params": {"mass": 1, "width": 0.2, "height": 0.2}}],
            "constraints": [{"id": "L", "type": kind, "a": {"body": None, "point": [0, 1.5]},
                             "b": {"body": "m", "point": [0, 0]}, **({"params": {"hinged_b": True}} if kind == "rod" else {})}],
        }

    rod, rope = run(pendulum("rod"), 3000, sample=100), run(pendulum("rope"), 3000, sample=100)
    for a, b in zip(rod, rope):
        assert a["bodies"][0]["x"] == pytest.approx(b["bodies"][0]["x"], abs=2e-3)  # same motion up to the constraint tolerance
    for b in rope[1:]:
        assert con(b, "L")["taut"] and con(b, "L")["force"] > 0
    # exact tension at the start (at rest): m g cos(theta)
    first = run(pendulum("rope"), 1)[1]
    assert con(first, "L")["force"] == pytest.approx(G * math.cos(0.4), rel=0.01)


def test_a_slack_rope_does_not_hold_a_mass_that_is_thrown_up():
    scene = {
        "version": "0.3", "solver": {"dt": 0.001}, "gravity": [0, -G],
        "bodies": [{"id": "m", "type": "block", "position": [0, 0.5], "velocity": [0, 3.0],
                    "params": {"mass": 1, "width": 0.2, "height": 0.2}}],
        "constraints": [{"id": "R", "type": "rope", "a": {"body": None, "point": [0, 2.0]},
                         "b": {"body": "m", "point": [0, 0]}, "params": {"length": 3.0}}],
    }
    for f in run(scene, 600, sample=10):
        assert not con(f, "R")["taut"]
        assert f["bodies"][0]["vy"] == pytest.approx(3.0 - G * f["t"], abs=1e-9)


# --- joints -------------------------------------------------------------------------------------


def double_rod_pendulum(th1, th2, t_end, m=1.0, l=0.6, w=0.08, dt=1e-3):
    """RK4 of the Lagrange equations of two uniform bars l x w (angles from the downward vertical)."""
    icm = m * (l * l + w * w) / 12

    def acc(y):
        a, b, wa, wb = y
        c, s = math.cos(a - b), math.sin(a - b)
        # [A11 A12; A12 A22] [ddA; ddB] = rhs
        A11 = icm + m * l * l / 4 + m * l * l
        A12 = m * l * l / 2 * c
        A22 = icm + m * l * l / 4
        r1 = -(m * l * l / 2) * s * wb * wb - (m / 2 + m) * G * l * math.sin(a)
        r2 = (m * l * l / 2) * s * wa * wa - m * G * (l / 2) * math.sin(b)
        det = A11 * A22 - A12 * A12
        return [(r1 * A22 - A12 * r2) / det, (A11 * r2 - A12 * r1) / det]

    def f(y):
        da, db = acc(y)
        return [y[2], y[3], da, db]

    y = [th1, th2, 0.0, 0.0]
    out = [tuple(y[:2])]
    for _ in range(round(t_end / dt)):
        k1 = f(y)
        k2 = f([yi + dt / 2 * k for yi, k in zip(y, k1)])
        k3 = f([yi + dt / 2 * k for yi, k in zip(y, k2)])
        k4 = f([yi + dt * k for yi, k in zip(y, k3)])
        y = [yi + dt / 6 * (a + 2 * b + 2 * c + d) for yi, a, b, c, d in zip(y, k1, k2, k3, k4)]
        out.append(tuple(y[:2]))
    return out


def test_double_pendulum_matches_the_lagrange_reference(load_example):
    s = load_example("double_pendulum")
    th1, th2 = s["bodies"][0]["angle"], s["bodies"][1]["angle"]
    reference = double_rod_pendulum(th1, th2, 2.0)
    frames = run(s, 2000, sample=1)
    worst = 0.0
    for i in range(0, 2001, 50):
        phi1, phi2 = frames[i]["bodies"][0]["phi"], frames[i]["bodies"][1]["phi"]
        worst = max(worst, abs(phi1 - reference[i][0]), abs(phi2 - reference[i][1]))
    assert worst < 0.03, f"max angle difference {worst:.4f} rad over 2 s"


def test_pin_joint_stays_closed(load_example):
    frames = run(load_example("double_pendulum"), 5000, sample=50)
    for f in frames:
        upper, lower = f["bodies"]
        def end(b, y):
            c, s = math.cos(b["phi"]), math.sin(b["phi"])
            return (b["x"] - s * y, b["y"] + c * y)
        assert math.dist(end(upper, -0.3), end(lower, 0.3)) < 3e-3
        assert con(f, "J")["position"] == pytest.approx(end(upper, -0.3), abs=1e-9)


def test_welded_pendulum_swings_as_one_rigid_body(load_example):
    s = load_example("welded_pendulum")
    # rigid L: total mass 2, centre of mass, inertia about the pivot at (0, 1.5)
    Iv = (0.08**2 + 0.8**2) / 12 + 1.0 * 0.4**2
    Ih = (0.6**2 + 0.08**2) / 12 + 1.0 * (0.3**2 + 0.8**2)
    cx, cy = (0 * 1 + 0.3 * 1) / 2, ((1.1 - 1.5) * 1 + (0.7 - 1.5) * 1) / 2
    d = math.hypot(cx, cy)
    period = 2 * math.pi * math.sqrt((Iv + Ih) / (2.0 * G * d))
    frames = run(s, round(8 * period / 0.001), sample=1)
    phi_v = [f["bodies"][0]["phi"] for f in frames]
    phi_h = [f["bodies"][1]["phi"] for f in frames]
    assert max(abs(a - b) for a, b in zip(phi_v, phi_h)) < 2e-3, "the weld does not turn"
    # equilibrium of the swing: the centre of mass hangs below the pivot
    eq = math.atan2(cx, -cy)  # angle by which the L must turn clockwise
    mean = sum(phi_v) / len(phi_v)
    assert mean == pytest.approx(-eq, abs=0.03)
    crossings = [i * 1e-3 for i in range(1, len(phi_v)) if phi_v[i - 1] < mean <= phi_v[i]]
    measured = (crossings[-1] - crossings[0]) / (len(crossings) - 1)
    assert measured == pytest.approx(period, rel=0.03)


def test_free_space_festlager_is_a_pure_anchor(load_example):
    s = load_example("rope_catch")
    f0 = run(s, 1)[0]
    pin = con(f0, "P")
    assert pin["type"] == "pin_support"
    assert pin["position"] == pytest.approx([0.0, 1.5])
    assert pin["reaction"] == [0.0, 0.0]
