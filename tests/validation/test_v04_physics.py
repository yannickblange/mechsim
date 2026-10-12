"""v0.4 example scenes against theory: vibrations (free, harmonic, forced), Fachwerke, beams."""
from __future__ import annotations

import copy
import math

import numpy as np
import pytest

from mechsim.analysis import truss
from mechsim.analysis.sections import section_properties
from mechsim.sim import Simulation

pytestmark = pytest.mark.native

G = 9.81


def trajectory(scene, seconds, key=lambda frame: frame["bodies"][0]["x"], every=1):
    """(t, value) arrays sampled every `every` steps."""
    ts, vs = [], []
    with Simulation(scene) as sim:
        dt = sim.dt
        for _ in range(int(round(seconds / dt / every))):
            sim.step(n=every)
            frame = sim.frame()
            ts.append(frame["t"])
            vs.append(key(frame))
    return np.array(ts), np.array(vs)


def crossings(t, v, direction=+1):
    """Times (linearly interpolated) at which v crosses zero upwards (+1) or downwards (-1)."""
    out = []
    for i in range(1, len(v)):
        if direction * v[i - 1] < 0 <= direction * v[i]:
            out.append(t[i - 1] - v[i - 1] * (t[i] - t[i - 1]) / (v[i] - v[i - 1]))
    return np.array(out)


def peaks(t, v):
    """Local maxima of v (the turning points on the positive side)."""
    idx = [i for i in range(1, len(v) - 1) if v[i - 1] < v[i] >= v[i + 1] and v[i] > 0]
    return t[idx], v[idx]


# --- the three vibrations ---------------------------------------------------------------------------------


def test_harmonic_oscillation_is_x0_cos_omega_t(load_example):
    scene = load_example("harmonic_oscillation")
    k = scene["elements"][0]["params"]["k"]
    m = scene["bodies"][0]["params"]["mass"]
    omega = math.sqrt(k / m)
    assert omega == pytest.approx(2 * math.pi)
    t, x = trajectory(scene, 5.0)
    assert np.max(np.abs(x - 0.3 * np.cos(omega * t))) < 2e-3  # 5 periods, semi-implicit Euler at dt = 1 ms
    up = crossings(t, x - 0.0, +1)
    assert np.diff(up).mean() == pytest.approx(1.0, rel=2e-3)  # T = 2 pi / omega0 = 1 s
    assert x.max() == pytest.approx(0.3, rel=3e-3) and x.min() == pytest.approx(-0.3, rel=3e-3)  # undamped


def test_free_vibration_decays_with_the_logarithmic_decrement(load_example):
    scene = load_example("free_vibration")
    k = scene["elements"][0]["params"]["k"]
    m = scene["bodies"][0]["params"]["mass"]
    c = scene["elements"][1]["params"]["c"]
    zeta = c / (2 * math.sqrt(k * m))
    assert zeta == pytest.approx(0.1)
    omega_d = math.sqrt(k / m) * math.sqrt(1 - zeta**2)
    t, x = trajectory(scene, 8.0)
    tp, xp = peaks(t, x)
    assert len(xp) >= 7
    # amplitude ratio of successive peaks: exp(-2 pi zeta / sqrt(1 - zeta^2))
    ratio = math.exp(-2 * math.pi * zeta / math.sqrt(1 - zeta**2))
    assert xp[1:] / xp[:-1] == pytest.approx(ratio, rel=0.01)
    assert np.diff(tp).mean() == pytest.approx(2 * math.pi / omega_d, rel=3e-3)
    # the envelope: x_peak(t) = x0 exp(-zeta omega0 t) (the peaks are slightly before the cosine's)
    assert xp == pytest.approx(0.3 * np.exp(-zeta * math.sqrt(k / m) * tp), rel=0.03)
    # it comes to rest: nothing left after 8 s
    assert abs(x[-1]) < 0.3 * ratio**7


def test_forced_vibration_reaches_the_steady_state_amplitude_and_the_exciting_frequency(load_example):
    scene = load_example("forced_vibration")
    k = scene["elements"][0]["params"]["k"]
    m = scene["bodies"][0]["params"]["mass"]
    c = scene["elements"][1]["params"]["c"]
    force = scene["elements"][2]["params"]
    F0, f = force["force"][0], force["frequency"]
    Omega = 2 * math.pi * f
    zeta = c / (2 * math.sqrt(k * m))
    eta = Omega / math.sqrt(k / m)
    expected = F0 / k / math.sqrt((1 - eta**2) ** 2 + (2 * zeta * eta) ** 2)
    t, x = trajectory(scene, 20.0)  # the transient decays like exp(-zeta omega0 t) = exp(-0.63 t)
    steady = t > 15
    assert (x[steady].max() - x[steady].min()) / 2 == pytest.approx(expected, rel=0.02)
    # the steady response oscillates at the exciting frequency (not at the natural one) ...
    up = crossings(t[steady], x[steady] - x[steady].mean(), +1)
    assert np.diff(up).mean() == pytest.approx(1 / f, rel=5e-3)
    # ... lagging behind the force by atan2(2 zeta eta, 1 - eta^2)
    lag = math.atan2(2 * zeta * eta, 1 - eta**2)
    A = np.column_stack([np.sin(Omega * t[steady]), np.cos(Omega * t[steady]), np.ones(steady.sum())])
    (a, b, _), *_ = np.linalg.lstsq(A, x[steady], rcond=None)  # x = a sin + b cos = X sin(Omega t - lag)
    assert math.hypot(a, b) == pytest.approx(expected, rel=0.02)
    assert math.atan2(-b, a) == pytest.approx(lag, abs=0.03)
    # near resonance the amplification is large; the first swing is beating between both frequencies
    assert expected / (F0 / k) > 3.5
    assert np.abs(x[t < 3]).max() > 0.5 * expected


def test_the_free_vibration_peak_ratio_differs_from_the_undamped_one(load_example):
    # sanity of the three scenes: undamped keeps its amplitude, damped loses half per swing
    t0, x0 = trajectory(load_example("harmonic_oscillation"), 4.0)
    t1, x1 = trajectory(load_example("free_vibration"), 4.0)
    assert peaks(t0, x0)[1][-1] > 0.29
    assert peaks(t1, x1)[1][-1] < 0.3 * 0.54**3 * 1.05


# --- Fachwerke ----------------------------------------------------------------------------------------------


def test_truss_bridge_forces_by_the_method_of_joints(load_example):
    scene = load_example("truss_bridge")
    expected = truss.joint_forces(scene)
    assert len(expected) == 7
    with Simulation(scene) as sim:
        sim.step(n=5)
        frame = sim.frame()
    forces = {c["id"]: c["force"] for c in frame["constraints"] if c["type"] == "rod"}
    for sid, value in expected.items():
        assert forces[sid] == pytest.approx(value, rel=1e-4, abs=1e-2), sid
    # the textbook picture: the bottom chord pulls, the top chord pushes
    assert forces["S1"] > 0 and forces["S2"] > 0
    assert forces["S5"] < 0
    # reactions: half the load (plus the weight of the nodes) at each support, no horizontal force
    pin = next(c for c in frame["constraints"] if c["id"] == "A1")
    roller = next(c for c in frame["constraints"] if c["id"] == "B1")
    assert pin["reaction"][1] + roller["reaction"][1] == pytest.approx(2000 + 5 * G, rel=1e-6)
    assert pin["reaction"][0] == pytest.approx(0.0, abs=1e-3)
    # statically determinate and at rest: it stays where it is
    with Simulation(scene) as sim:
        sim.step(n=3000)
        later = sim.frame()
    for a, b in zip(frame["bodies"], later["bodies"]):
        assert (b["x"], b["y"]) == pytest.approx((a["x"], a["y"]), abs=1e-6)


def settle(scene, steps=8000):
    with Simulation(scene) as sim:
        sim.step(n=steps)  # damped: it rests after a few seconds
        return sim.frame()


def test_elastic_truss_shares_the_load_by_stiffness(load_example):
    scene = load_example("truss_elastic")
    with pytest.raises(ValueError):
        truss.joint_forces(scene)  # indeterminate: one member too many

    # (a) the pure axial bars of v0.4 (one element: no weight, no bending): exactly the direct stiffness method
    axial = copy.deepcopy(scene)
    for e in axial["elements"]:
        if e["type"] == "bar":
            e["params"]["segments"] = 1
    expected = truss.stiffness_forces(axial)
    frame = settle(axial)
    bars = {e["id"]: e for e in frame["elements"] if e["type"] == "bar"}
    for sid, value in expected.items():
        assert bars[sid]["force"] == pytest.approx(value, rel=0.02, abs=2.0), sid
        area = section_properties(next(e for e in axial["elements"] if e["id"] == sid)["params"]["section"])["area"]
        assert bars[sid]["stress"] == pytest.approx(abs(bars[sid]["force"]) / area, rel=1e-9)  # no bending
    assert all(abs(b["vx"]) + abs(b["vy"]) < 1e-6 for b in frame["bodies"])
    assert abs(expected["S8"]) > 100  # the redundant diagonal carries a share

    # (b) the steel members as they are (4 elements, their own weight): they sag, and a sagging member is
    # softer than E A / L (the chord shortens by 8 w^2 / 3 L, micrometres, as much as the load deforms them): the
    # statically determinate members are unaffected, the redundant ones shift by a few ten per cent of the largest force
    expected = truss.stiffness_forces(scene)
    frame = settle(scene)
    bars = {e["id"]: e for e in frame["elements"] if e["type"] == "bar"}
    largest = max(abs(v) for v in expected.values())
    for sid, value in expected.items():
        assert bars[sid]["force"] == pytest.approx(value, abs=0.2 * largest), sid
    for sid in ("S1", "S3"):  # equilibrium of the end nodes fixes them
        assert bars[sid]["force"] == pytest.approx(expected[sid], rel=0.01)
    for sid, bar in bars.items():  # the stress now includes the bending of the sag
        area = section_properties(next(e for e in scene["elements"] if e["id"] == sid)["params"]["section"])["area"]
        assert bar["stress"] >= abs(bar["force"]) / area * (1 - 1e-9)
        assert len(bar["nodes"]) == 5 and bar["pcr"] > 0


def test_trusses_conserve_energy_on_the_scale_of_the_energy_that_moves(load_example):
    # a determinate truss at rest: the total energy does not change at all
    scene = load_example("truss_bridge")
    totals = []
    with Simulation(scene) as sim:
        for _ in range(500):
            sim.step(n=10)
            e = sim.frame()["energy"]
            totals.append(e["kinetic"] + e["potential"])
    assert max(totals) - min(totals) < 1e-9
    # the damped elastic truss only loses energy: the total never rises (within round-off of the scheme)
    # and what it had to give up is the work of the load on its way to the static state
    scene = load_example("truss_elastic")
    totals = []
    with Simulation(scene) as sim:
        for _ in range(500):
            sim.step(n=10)
            e = sim.frame()["energy"]
            totals.append(e["kinetic"] + e["potential"])
    scale = max(totals) - min(totals)
    assert scale > 1e-3
    assert all(b <= a + 0.02 * scale for a, b in zip(totals, totals[1:]))
    assert totals[-1] < totals[0]


# --- beams ---------------------------------------------------------------------------------------------------


def test_cantilever_beam_with_a_tip_mass_swings_at_the_cantilever_frequency(load_example):
    scene = load_example("cantilever_beam")
    beam = scene["bodies"][0]["params"]
    block = scene["bodies"][1]["params"]
    L = beam["length"]
    props = section_properties(beam["section"])
    EI = 210e9 * props["inertia"]
    m_beam = 7850 * props["area"] * L
    omega = math.sqrt(3 * EI / (L**3 * (block["mass"] + 33 / 140 * m_beam)))
    q = m_beam * G / L
    static = block["mass"] * G * L**3 / (3 * EI) + q * L**4 / (8 * EI)
    t, y = trajectory(scene, 10.0, key=lambda f: f["bodies"][1]["y"], every=5)
    # from rest the tip swings between 0 and twice the static deflection, about the static deflection
    assert -y.min() == pytest.approx(2 * static, rel=0.06)
    assert -np.mean(y) == pytest.approx(static, rel=0.05)
    up = crossings(t, y + static, +1)
    assert len(up) >= 8
    assert np.diff(up).mean() == pytest.approx(2 * math.pi / omega, rel=0.03)
    # a clamped beam does not rotate at its root
    with Simulation(scene) as sim:
        sim.step(n=2000)
        nodes = sim.frame()["bodies"][0]["nodes"]
    assert nodes[0][2] == pytest.approx(0.0, abs=1e-9)
    assert nodes[0][1] == pytest.approx(0.0, abs=1e-9)


def ellipticK(k):
    a, b = 1.0, math.sqrt(1 - k * k)
    for _ in range(40):
        a, b = (a + b) / 2, math.sqrt(a * b)
    return math.pi / (2 * a)


def test_i_beam_settles_at_the_static_deflection_when_damped_and_swings_when_not(load_example):
    scene = load_example("beam_i_section")
    beam = scene["bodies"][0]["params"]
    assert beam["damping"] > 0  # the example's beam has some structural damping
    L = beam["length"]
    props = section_properties(beam["section"])
    EI = 210e9 * props["inertia"]
    q = 7850 * props["area"] * G
    P = -scene["elements"][0]["params"]["force"][1]
    static = P * L**3 / (48 * EI) + 5 * q * L**4 / (384 * EI)

    # damped: a suddenly applied constant force overshoots once and then HOLDS the static deflection
    t, y = trajectory(scene, 3.0, key=lambda f: f["bodies"][0]["y"], every=5)
    assert -y.min() > 1.05 * static  # it overshoots ...
    assert -y.min() < 2.0 * static  # ... by less than the undamped factor 2
    assert np.all(-y[t > 1.5] == pytest.approx(static, rel=0.03))  # and then it stays
    assert np.ptp(y[t > 2.0]) < 0.01 * static  # no more movement
    with Simulation(scene) as sim:
        sim.step(n=3000)
        frame = sim.frame()["bodies"][0]
    assert frame["vy"] == pytest.approx(0.0, abs=1e-4)  # (m/s: still decaying like exp(-4 t))
    assert frame["EI"] == pytest.approx(EI, rel=1e-12)
    assert frame["stress"] > 1e6  # Pa: millions, as for a loaded steel beam

    # undamped (the same beam with damping 0): it swings between 0 and twice the static deflection for ever
    swing = copy.deepcopy(scene)
    swing["bodies"][0]["params"]["damping"] = 0
    t2, y2 = trajectory(swing, 3.0, key=lambda f: f["bodies"][0]["y"], every=5)
    assert -y2.min() == pytest.approx(2 * static, rel=0.06)
    assert -np.mean(y2) == pytest.approx(static, rel=0.05)
    assert np.ptp(y2[t2 > 2.0]) > 1.5 * static  # still swinging at t > 2 s

    # as an H (weak axis) the beam is much softer, as a stiffer I would be stiffer
    softer = copy.deepcopy(scene)
    softer["bodies"][0]["params"]["section"] = {"type": "H", **{k: v for k, v in beam["section"].items() if k != "type"}}
    t3, y3 = trajectory(softer, 4.0, key=lambda f: f["bodies"][0]["y"], every=5)
    assert -y3.min() > 5 * -y.min()


def test_columns_buckle_above_the_euler_load_and_only_then(load_example):
    scene = load_example("buckling_columns")
    L = 2.0
    props = section_properties({"type": "square", "a": 0.02})
    Pcr = math.pi**2 * 210e9 * props["inertia"] / L**2
    bars = {e["id"]: e for e in scene["elements"] if e["type"] == "bar"}
    loads = {e["body"]: -e["params"]["force"][1] for e in scene["elements"] if e["type"] == "load"}
    ratios = {"N1": loads["N1"] / Pcr, "N2": loads["N2"] / Pcr}
    assert ratios["N1"] == pytest.approx(0.7, abs=1e-3) and ratios["N2"] == pytest.approx(1.3, abs=1e-3)
    with Simulation(scene) as sim:
        sim.step(n=300)
        early = {e["id"]: e for e in sim.frame()["elements"] if e["type"] == "bar"}
        sim.step(n=6000)
        frame = sim.frame()
    final = {e["id"]: e for e in frame["elements"] if e["type"] == "bar"}
    sway = lambda bar: max(abs(n[0] - bar["p1"][0]) for n in bar["nodes"])  # largest lateral deflection of a bar
    assert final["S1"]["pcr"] == pytest.approx(Pcr, rel=1e-9)

    # the left column (0.7 Pcr): the 2 mm bow grows by 1 / (1 - 0.7) = 3.3, and it stays there
    bow = bars["S1"]["params"]["imperfection"] * L
    weight_share = 0.5 * 7850 * props["area"] * L * G / Pcr  # the column's own weight adds to the compression
    assert sway(final["S1"]) == pytest.approx(bow / (1 - ratios["N1"] - weight_share), rel=0.1)
    assert sway(final["S1"]) < 0.01 * L
    assert -final["S1"]["force"] / Pcr == pytest.approx(ratios["N1"] + weight_share, rel=0.03)

    # the right column (1.3 Pcr): buckled, held in the post-buckled shape of Euler's elastica
    ratio = ratios["N2"] + weight_share
    lo, hi = 1e-6, 0.99
    for _ in range(80):
        k = (lo + hi) / 2
        lo, hi = (lo, k) if 2 * ellipticK(k) / math.pi > math.sqrt(ratio) else (k, hi)
    k = (lo + hi) / 2
    assert sway(final["S2"]) == pytest.approx(k * L / ellipticK(k), rel=0.06)
    assert sway(final["S2"]) > 0.3 * L
    # the label's input: how much of the Euler load is carried (the most compressed element carries all of P)
    # (at mid-height the tangent is vertical: N = P; the most compressed of 8 elements is a few degrees off: cos ~ 0.96)
    assert -final["S2"]["force"] / Pcr == pytest.approx(ratio, rel=0.06)
    # at rest in both
    assert all(abs(b["vx"]) + abs(b["vy"]) < 1e-3 for b in frame["bodies"])
    assert sway(early["S2"]) < sway(final["S2"])  # it needs time to buckle: it grows from the bow


