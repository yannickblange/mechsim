"""v0.9: the linear analysis (Eigenwerte, Dämpfungsgrad, critical cases, frequency response) against closed forms and the engine."""
from __future__ import annotations

import copy
import json
import math
from pathlib import Path

import numpy as np
import pytest

from mechsim.analysis.vibration import analyse

SCENES = Path(__file__).resolve().parents[2] / "scenes"


def scene(name: str) -> dict:
    return json.loads((SCENES / f"{name}.json").read_text())


def free(**changes) -> dict:
    """free_vibration (m = 1 kg, k = 4 pi^2 N/m, c = 0.1 c_crit) with other values."""
    sc = scene("free_vibration")
    for key, value in changes.items():
        if key == "m":
            sc["bodies"][0]["params"]["mass"] = value
        elif key == "k":
            sc["elements"][0]["params"]["k"] = value
        elif key == "c":
            sc["elements"][1]["params"]["c"] = value
    return sc


def test_the_classic_oscillator_has_the_closed_form_numbers():
    r = analyse(free(), response=False)
    assert r["supported"] and [d["label"] for d in r["dofs"]] == ["x(mass)"]
    (mode,) = r["modes"]
    m, k, c = 1.0, 4 * math.pi ** 2, 0.1 * 2 * math.sqrt(4 * math.pi ** 2)
    omega0, d = math.sqrt(k / m), c / (2 * math.sqrt(k * m))
    assert mode["omega0"] == pytest.approx(omega0, rel=1e-6) and mode["f0"] == pytest.approx(1.0, rel=1e-6)
    assert mode["zeta"] == pytest.approx(d, rel=1e-6) == pytest.approx(0.1, rel=1e-6)
    assert mode["omega_d"] == pytest.approx(omega0 * math.sqrt(1 - d * d), rel=1e-6)
    assert mode["decay_time"] == pytest.approx(1 / (d * omega0), rel=1e-6)
    assert mode["log_decrement"] == pytest.approx(2 * math.pi * d / math.sqrt(1 - d * d), rel=1e-6)
    assert mode["critical_scale"] == pytest.approx(10.0, rel=1e-6)  # ten times the damping and it is aperiodic
    assert mode["kind"] == "unterkritisch"
    assert mode["eigenvalue"][0] == pytest.approx(-d * omega0, rel=1e-6) and mode["eigenvalue"][1] == pytest.approx(mode["omega_d"], rel=1e-6)
    single = r["single"]
    assert single["c_crit"] == pytest.approx(2 * math.sqrt(k * m), rel=1e-6) and single["damping_ratio"] == pytest.approx(0.1, rel=1e-6)


@pytest.mark.parametrize("ratio, kind", [(0.0, "ungedämpft"), (0.5, "unterkritisch"), (1.0, "aperiodischer Grenzfall"), (1.5, "überkritisch"), (4.0, "überkritisch")])
def test_the_damping_ratio_sorts_the_cases_and_the_limit_case_is_at_d_equal_one(ratio, kind):
    c_crit = 2 * math.sqrt(4 * math.pi ** 2)
    (mode,) = analyse(free(c=ratio * c_crit), response=False)["modes"]
    assert mode["kind"] == kind
    assert mode["zeta"] == pytest.approx(ratio, abs=1e-6)
    if ratio >= 1.0:
        assert mode["omega_d"] == pytest.approx(0.0, abs=1e-6)  # no oscillation
        assert mode["critical_scale"] == pytest.approx(1 / ratio, abs=1e-6)


def test_the_analysis_follows_the_values_m_k_c():
    base = analyse(free(), response=False)["modes"][0]
    stiffer = analyse(free(k=4 * 4 * math.pi ** 2), response=False)["modes"][0]  # four times k: twice the frequency, half the damping ratio
    assert stiffer["f0"] == pytest.approx(2 * base["f0"], rel=1e-6) and stiffer["zeta"] == pytest.approx(base["zeta"] / 2, rel=1e-6)
    heavier = analyse(free(m=4.0), response=False)["modes"][0]  # four times m: half the frequency, half the damping ratio
    assert heavier["f0"] == pytest.approx(base["f0"] / 2, rel=1e-6) and heavier["zeta"] == pytest.approx(base["zeta"] / 2, rel=1e-6)


def test_a_hanging_two_mass_chain_has_the_textbook_vertical_frequencies_and_sinks_to_its_static_deflection():
    r = analyse(scene("two_mass_chain"), response=False)
    assert r["rest_found"] and r["rest_moved"]
    K = np.array([[150 + 80, -80], [-80, 80.0]])
    M = np.diag([1.0, 0.5])
    expected = sorted(math.sqrt(w) / (2 * math.pi) for w in np.linalg.eigvals(np.linalg.solve(M, K)).real)
    vertical = [m["f0"] for m in r["modes"] if all(abs(s["re"]) < 1e-6 for s in m["shape"] if s["axis"] != "y")]
    assert vertical == pytest.approx(expected, rel=1e-6)
    # static deflection: k1 carries both weights, k2 the lower one (the springs are fastened above / below the centres by 0.075)
    y1, y2 = r["rest_position"]["m1"][1], r["rest_position"]["m2"][1]
    assert (1.2 - (y1 + 0.075)) == pytest.approx(0.5 + (1.0 + 0.5) * 9.81 / 150, abs=1e-6)
    assert ((y1 - 0.075) - (y2 + 0.075)) == pytest.approx(0.3 + 0.5 * 9.81 / 80, abs=1e-6)


def test_a_harmonic_load_gives_the_magnification_function_and_the_distance_to_the_resonance():
    r = analyse(scene("forced_vibration"), response=False)
    (load,) = r["loads"]
    eta, d = 0.9, 0.1
    assert load["eta"] == pytest.approx(eta, rel=1e-6) and load["resonance_distance"] == pytest.approx(0.1, rel=1e-6)
    assert load["magnification"][0] == pytest.approx(1 / math.sqrt((1 - eta ** 2) ** 2 + (2 * d * eta) ** 2), rel=1e-6)
    assert load["static"][0] == pytest.approx(4.0 / (4 * math.pi ** 2), rel=1e-6)
    assert load["response"][0]["phase_deg"] == pytest.approx(-math.degrees(math.atan2(2 * d * eta, 1 - eta ** 2)), abs=1e-4)  # the lag
    # the curve peaks near eta = sqrt(1 - 2 D^2)
    f, amp = np.array(r["frf"]["f"]), np.array(r["frf"]["loads"][0]["amplitude"][0])
    assert f[int(np.argmax(amp))] == pytest.approx(math.sqrt(1 - 2 * d * d), abs=0.01)
    res = analyse(scene("resonance"), response=False)["loads"][0]
    assert res["eta"] == pytest.approx(1.0, rel=1e-6) and res["magnification"][0] == pytest.approx(1 / (2 * 0.02), rel=1e-4)  # V = 1 / 2D at resonance


def test_what_the_analysis_cannot_linearise_it_says_so():
    for name, fragment in (("truss_bridge", "Stäbe"), ("incline_friction", "Feder"), ("beam_i_section", "Balken")):
        r = analyse(scene(name), response=False)
        assert r["supported"] is False and fragment in r["reason"], name
    sliding = copy.deepcopy(scene("friction_oscillator"))  # a block on a rough floor
    r = analyse(sliding, response=False)
    assert r["supported"] is False and "Reibung" in r["reason"]
    pinned = analyse(scene("pinned_block_spring"), response=False)  # a body on a pin: the support's curvature gives the restoring term
    assert pinned["supported"] and [d["label"] for d in pinned["dofs"]] == ["φ(plate)"]


# --- against the engine ----------------------------------------------------------------------------------------------------------

def _peaks(t, x):
    return [(t[i], x[i]) for i in range(1, len(x) - 1) if x[i] > x[i - 1] and x[i] >= x[i + 1] and x[i] > 0]


@pytest.mark.native
def test_the_engine_oscillates_at_the_predicted_damped_frequency_and_decay_rate():
    r = analyse(free(), t_max=8.0, samples=8000)
    (mode,) = r["modes"]
    resp = r["response"]
    t = resp["t"]
    u = [x - resp["rest"]["mass"][0] for x in resp["bodies"]["mass"]["x"]]
    peaks = _peaks(t, u)
    assert len(peaks) >= 6
    period = (peaks[5][0] - peaks[0][0]) / 5
    assert 2 * math.pi / period == pytest.approx(mode["omega_d"], rel=2e-3)
    decay = math.log(peaks[0][1] / peaks[5][1]) / (peaks[5][0] - peaks[0][0])
    assert decay == pytest.approx(mode["delta"], rel=2e-2)


@pytest.mark.native
def test_the_engine_swings_in_the_predicted_modes_of_a_hanging_chain_and_a_pinned_plate():
    r = analyse(scene("two_mass_chain"), t_max=20.0, samples=20000)
    resp = r["response"]
    t = np.array(resp["t"])
    dt = t[1] - t[0]
    y = np.array(resp["bodies"]["m2"]["y"])
    y = y - y.mean()
    spectrum = np.abs(np.fft.rfft(y * np.hanning(len(y))))
    freqs = np.fft.rfftfreq(len(y), dt)
    peak = freqs[int(np.argmax(spectrum))]
    vertical = [m["f0"] for m in r["modes"] if all(abs(s["re"]) < 1e-6 for s in m["shape"] if s["axis"] != "y")]
    assert min(abs(peak - f) for f in vertical) < 0.06  # the strongest line of the vertical motion is one of the predicted modes

    p = analyse(scene("pinned_block_spring"), t_max=12.0, samples=12000)
    phi = np.array(p["response"]["bodies"]["plate"]["phi"])
    pt = np.array(p["response"]["t"])
    phi = phi - phi.mean()
    freqs = np.fft.rfftfreq(len(phi), pt[1] - pt[0])
    peak = freqs[int(np.argmax(np.abs(np.fft.rfft(phi * np.hanning(len(phi))))))]
    assert peak == pytest.approx(p["modes"][0]["f0"], abs=0.1)


@pytest.mark.native
def test_the_response_of_a_scene_holds_what_the_panel_plots():
    r = analyse(scene("spring_damper"), t_max=2.0, samples=400)
    resp = r["response"]
    n = len(resp["t"])
    assert n >= 400 and resp["t"][0] == 0.0 and resp["t"][-1] == pytest.approx(2.0, abs=1e-6)
    assert all(len(v) == n for k in ("x", "y", "phi", "vx", "vy", "omega") for v in [resp["bodies"]["mass"][k]])
    assert len(resp["kinetic"]) == n and len(resp["potential"]) == n
    assert resp["rest"]["mass"][1] == pytest.approx(r["rest_position"]["mass"][1])


@pytest.mark.native
def test_the_simulation_can_start_from_the_rest_position_moved_by_an_offset_even_when_the_values_move_the_rest():
    r = analyse(free(), t_max=1.0, samples=100, offsets={"mass": {"x": 0.05}})
    resp = r["response"]
    assert resp["bodies"]["mass"]["x"][0] - resp["rest"]["mass"][0] == pytest.approx(0.05, abs=1e-9)
    assert r["start_offset"]["mass"][0] == pytest.approx(0.05, abs=1e-9)
    # a weight hanging on a spring: with k changed the rest moves, the start stays 5 cm above it
    sd = scene("spring_damper")
    a = analyse(sd, t_max=0.5, samples=50, offsets={"mass": {"y": 0.05}})
    sd["elements"][0]["params"]["k"] = 400.0
    b = analyse(sd, t_max=0.5, samples=50, offsets={"mass": {"y": 0.05}})
    assert a["rest_position"]["mass"][1] != pytest.approx(b["rest_position"]["mass"][1], abs=1e-3)
    for r2 in (a, b):
        assert r2["response"]["bodies"]["mass"]["y"][0] - r2["response"]["rest"]["mass"][1] == pytest.approx(0.05, abs=1e-9)
    # a pin keeps its point where it was: the plate starts turned by 0.1 rad from its rest angle, the pin has not moved
    p = scene("pinned_block_spring")
    c = analyse(p, t_max=0.2, samples=20, offsets={"plate": {"phi": 0.1}})
    plate = c["response"]["bodies"]["plate"]
    rest = c["response"]["rest"]["plate"]
    assert plate["phi"][0] - rest[2] == pytest.approx(0.1, abs=1e-9)
    cos, sin = math.cos(plate["phi"][0]), math.sin(plate["phi"][0])
    pin = (plate["x"][0] + cos * -0.2 - sin * -0.15, plate["y"][0] + sin * -0.2 + cos * -0.15)  # the pin at the local point (-0.2, -0.15)
    assert pin == pytest.approx((0.0, 0.0), abs=1e-9)
