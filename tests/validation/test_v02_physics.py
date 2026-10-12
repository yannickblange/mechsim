"""v0.2 components against closed-form results (loads, impulses, Loslager, Lager, spring ghost)."""
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


def block(mass=1.0, w=0.2, h=0.2, pos=(0.0, 0.0), id="m"):
    return {"id": id, "type": "block", "position": list(pos), "params": {"mass": mass, "width": w, "height": h}}


def scene(bodies, elements=(), constraints=(), gravity=(0.0, -G)):
    return {"version": "0.2", "gravity": list(gravity), "solver": {"dt": 0.001},
            "bodies": bodies, "elements": list(elements), "constraints": list(constraints)}


# --- Loslager --------------------------------------------------------------------------------


def test_incline_roller_acceleration_and_reaction(load_example):
    s = load_example("incline_roller")
    s["elements"] = []  # no spring: pure sliding
    theta = math.pi / 6
    frames = run(s, 200)
    t, n = (math.cos(theta), math.sin(theta)), (-math.sin(theta), math.cos(theta))
    b0, b1 = frames[0]["bodies"][0], frames[-1]["bodies"][0]
    s_along = (b1["x"] - b0["x"]) * t[0] + (b1["y"] - b0["y"]) * t[1]
    s_normal = (b1["x"] - b0["x"]) * n[0] + (b1["y"] - b0["y"]) * n[1]
    steps = 200
    expected = -G * math.sin(theta) * 1e-6 * steps * (steps + 1) / 2  # exact for semi-implicit Euler
    assert s_along == pytest.approx(expected, rel=1e-6)
    assert abs(s_normal) < 1e-9
    assert b1["phi"] == pytest.approx(theta, abs=1e-9)

    mass = s["bodies"][0]["params"]["mass"]
    normals = []
    for constraint in frames[-1]["constraints"]:
        fx, fy = constraint["reaction"]
        assert abs(fx * t[0] + fy * t[1]) < 1e-6, "no friction: the reaction is purely normal"
        normals.append(fx * n[0] + fy * n[1])
    assert sum(normals) == pytest.approx(mass * G * math.cos(theta), rel=1e-6)
    assert normals[0] == pytest.approx(normals[1], rel=1e-6), "gravity acts midway between the two rollers"


def test_incline_roller_spring_oscillates_about_the_equilibrium(load_example):
    s = load_example("incline_roller")
    theta = math.pi / 6
    frames = run(s, 5000)
    # Equilibrium along the incline: k (L - L0) = m g sin(theta)
    k, L0, m = 60.0, 0.45, 2.0
    L_eq = L0 + m * G * math.sin(theta) / k
    lengths = [math.dist(f["elements"][0]["p1"], f["elements"][0]["p2"]) for f in frames]
    mean_len = sum(lengths) / len(lengths)
    assert mean_len == pytest.approx(L_eq, rel=0.03)
    assert max(lengths) > L_eq + 0.1 and min(lengths) < L_eq - 0.1  # really oscillating
    assert frames[0]["elements"][0]["force"] == pytest.approx(k * (0.75 - L0), rel=1e-6)  # starts in tension


def test_roller_on_the_wrong_side_of_the_angle_behaves_identically(load_example):
    a = load_example("incline_roller")
    b = copy.deepcopy(a)
    for constraint in b["constraints"]:
        constraint["params"]["angle"] += math.pi
    fa, fb = run(a, 500)[-1], run(b, 500)[-1]
    assert fa["bodies"][0]["x"] == pytest.approx(fb["bodies"][0]["x"], abs=1e-9)
    assert fa["bodies"][0]["y"] == pytest.approx(fb["bodies"][0]["y"], abs=1e-9)


# --- Lager (fixed) -------------------------------------------------------------------------------


def test_cantilever_reaction_force_and_moment():
    m, L = 3.0, 1.2
    s = scene(
        [block(m, L, 0.1, (0.6, 0.5), "beam")],
        [{"id": "F1", "type": "load", "body": "beam", "point": [0.6, 0.05], "params": {"force": [0.0, -5.0]}}],
        [{"id": "E", "type": "fixed_support", "body": "beam", "point": [-0.6, 0.0]}],
    )
    frames = run(s, 1000, sample=100)
    for frame in frames[1:]:
        fx, fy, mz = frame["constraints"][0]["reaction"]
        assert fx == pytest.approx(0.0, abs=1e-6)
        assert fy == pytest.approx(m * G + 5.0, rel=1e-9)
        # about the clamp: weight at 0.6 m and the tip force at 1.2 m, both clockwise
        assert mz == pytest.approx(m * G * 0.6 + 5.0 * 1.2, rel=1e-9)
        assert frame["bodies"][0]["phi"] == pytest.approx(0.0, abs=1e-9)


def test_cantilever_example_reaction_averages_to_the_static_load(load_example):
    s = load_example("cantilever_clamp")
    steps = 4443  # about ten periods of the spring-mass (omega = sqrt(200 / 1))
    frames = run(s, steps)
    mean_fy = sum(f["constraints"][0]["reaction"][1] for f in frames) / len(frames)
    assert mean_fy == pytest.approx((3.0 + 1.0) * G + 5.0, rel=0.02)
    fy = [f["constraints"][0]["reaction"][1] for f in frames]
    assert max(fy) - min(fy) > 10.0, "the oscillating weight must modulate the reaction"
    assert all(len(f["constraints"][0]["reaction"]) == 3 for f in frames)


# --- Loads -----------------------------------------------------------------------------------


def test_constant_force_and_moment_on_a_free_block():
    J = 2.0 * (0.2**2 + 0.2**2) / 12
    s = scene(
        [block(2.0)],
        [{"id": "F1", "type": "load", "body": "m", "point": [0, 0], "params": {"force": [4.0, 0.0], "moment": 0.3}}],
        gravity=(0.0, 0.0),
    )
    last = run(s, 1000)[-1]["bodies"][0]
    assert last["vx"] == pytest.approx(2.0, rel=1e-9)  # F / m * t
    assert last["omega"] == pytest.approx(0.3 / J, rel=1e-9)


def test_impulse_on_the_pendulum_example(load_example):
    s = load_example("impulse_pendulum")
    m, h, w, d, J = 2.0, 1.0, 0.06, 0.5, 1.5
    I_A = m * (w * w + h * h) / 12 + m * d * d
    omega0 = J * 1.0 / I_A  # angular momentum about the pivot: cross((0, -1), (J, 0)) = J
    with Simulation(s) as sim:
        f0 = sim.frame()["bodies"][0]
        assert f0["omega"] == pytest.approx(omega0, rel=1e-9)
        assert f0["vx"] == pytest.approx(d * omega0, rel=1e-9)  # the pin forces v_cm = omega x r
        assert f0["vy"] == pytest.approx(0.0, abs=1e-9)

        phis = []
        for _ in range(2000):
            sim.step()
            phis.append(sim.frame()["bodies"][0]["phi"])
        # energy: 0.5 I_A omega0^2 = m g d (1 - cos(phi_max))
        phi_max = math.acos(1 - 0.5 * I_A * omega0**2 / (m * G * d))
        assert max(abs(p) for p in phis) == pytest.approx(phi_max, rel=0.02)

        sim.reset()  # the impulse is applied again after a reset, and only once
        again = sim.frame()
        assert again["t"] == 0
        assert again["bodies"][0]["omega"] == pytest.approx(omega0, rel=1e-9)
        assert again["elements"][0]["active"] is True
        sim.step()
        assert sim.frame()["elements"][0]["active"] is False


def test_impulse_is_not_a_force_afterwards():
    s = scene(
        [block(2.0)],
        [{"id": "J1", "type": "load", "body": "m", "point": [0, 0], "params": {"force": [3.0, 0.0], "mode": "impulse"}}],
        gravity=(0.0, 0.0),
    )
    frames = run(s, 500, sample=100)
    assert all(f["bodies"][0]["vx"] == pytest.approx(1.5, rel=1e-12) for f in frames)


def test_disc_example_oscillates_with_omega_sqrt_2k_over_m(load_example):
    scene = load_example("disc_spring_moment")
    k, m, r, H, L0, M = 30.0, 1.5, 0.25, 0.8, 0.5, -2.2
    # The example swings widely; for the closed-form check start close to equilibrium so the
    # small-angle formulas apply (spring torque r k (H - L0) = 2.25 N m is almost balanced by M).
    scene["elements"][1]["params"]["moment"] = M
    omega = math.sqrt(2 * k / m)  # J = m r^2 / 2: independent of r
    phi_eq = (M + r * k * (H - L0)) / (k * r * r)  # small-angle equilibrium of spring + moment
    period = 2 * math.pi / omega
    frames = run(scene, round(6 * period / 1e-3))
    phis = [f["bodies"][0]["phi"] for f in frames]
    assert sum(phis) / len(phis) == pytest.approx(phi_eq, rel=0.06)
    # period from the upward zero crossings of phi - phi_eq
    ups = [i * 1e-3 for i in range(1, len(phis)) if phis[i - 1] < phi_eq <= phis[i]]
    assert len(ups) >= 5
    measured = (ups[-1] - ups[0]) / (len(ups) - 1)
    assert measured == pytest.approx(period, rel=0.03)
    # the pin holds the centre; the spring starts in tension (ghost shorter than installed)
    assert all(abs(f["bodies"][0]["x"]) < 1e-3 and abs(f["bodies"][0]["y"] - 0.6) < 1e-3 for f in frames)
    assert frames[0]["elements"][0]["force"] == pytest.approx(k * (H - L0))


# --- Spring with a relaxed (ghost) length -------------------------------------------------------


@pytest.mark.parametrize(
    "rest, direction",
    [(0.3, +1), (0.8, -1)],
    ids=["ghost shorter: tension pulls to the anchor", "ghost longer: compression pushes away"],
)
def test_spring_direction_follows_the_relaxed_length(rest, direction):
    s = scene(
        [block(1.0, pos=(0.0, 0.5))],
        [{"id": "k1", "type": "spring", "a": {"body": None, "point": [0, 1.0]},
          "b": {"body": "m", "point": [0, 0]}, "params": {"k": 40.0, "rest_length": rest}}],
        gravity=(0.0, 0.0),
    )
    frames = run(s, 10)
    f = frames[0]["elements"][0]["force"]
    assert f == pytest.approx(40.0 * (0.5 - rest))
    assert frames[-1]["bodies"][0]["vy"] * direction > 0  # +y is towards the anchor
    assert frames[-1]["bodies"][0]["vy"] == pytest.approx(direction * abs(f) / 1.0 * 0.01, rel=0.01)


# --- Energy ----------------------------------------------------------------------------------


def test_constant_load_work_equals_energy_change():
    s = scene(
        [block(1.0)],
        [{"id": "F1", "type": "load", "body": "m", "point": [0.1, 0.0], "params": {"force": [5.0, 3.0], "moment": 0.2}}],
        gravity=(0.0, 0.0),
    )
    frames = run(s, 3000, sample=10)
    e = [f["energy"]["kinetic"] + f["energy"]["potential"] for f in frames]
    peak = max(f["energy"]["kinetic"] for f in frames)
    assert (max(e) - min(e)) / peak < 0.01
    assert frames[0]["energy"]["potential"] == pytest.approx(-(5.0 * 0.1))
