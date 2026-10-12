"""v0.3c damper against closed-form results."""
import math

import pytest

from mechsim.sim import Simulation

pytestmark = pytest.mark.native

G = 9.81


def run(scene, steps):
    frames = []
    with Simulation(scene) as sim:
        frames.append(sim.frame())
        for _ in range(steps):
            sim.step()
            frames.append(sim.frame())
    return frames


def test_spring_damper_example_decays_with_the_damped_frequency(load_example):
    s = load_example("spring_damper")
    m, k, c = 2.0, 200.0, 8.0
    zeta = c / (2 * math.sqrt(k * m))
    w0 = math.sqrt(k / m)
    wd = w0 * math.sqrt(1 - zeta**2)
    y_eq = 1.5 - (0.8 + m * G / k) - 0.1  # block centre at static equilibrium
    frames = run(s, 3000)
    x = [f["bodies"][0]["y"] - y_eq for f in frames]
    peaks = [i for i in range(1, len(x) - 1) if x[i] > x[i - 1] and x[i] >= x[i + 1] and x[i] > 0]
    assert len(peaks) >= 3
    t = [frames[i]["t"] for i in peaks]
    assert t[1] - t[0] == pytest.approx(2 * math.pi / wd, rel=0.01)
    assert x[peaks[1]] / x[peaks[0]] == pytest.approx(math.exp(-zeta * w0 * 2 * math.pi / wd), rel=0.03)
    # the energy only goes down, to the potential energy of the equilibrium
    energy = [f["energy"]["kinetic"] + f["energy"]["potential"] for f in frames]
    assert all(b <= a + 1e-2 for a, b in zip(energy, energy[1:]))
    assert abs(x[-1]) < 0.15 * abs(x[0])


def test_the_force_of_the_damper_is_c_times_the_rate_of_change_of_the_length(load_example):
    frames = run(load_example("spring_damper"), 1500)

    def damper(f):
        return next(e for e in f["elements"] if e["id"] == "c1")

    # semi-implicit Euler moves the bodies with the new velocity, so the length changed by dt * dL/dt
    for prev, cur in zip(frames[:-1], frames[1:]):
        rate = (math.dist(damper(cur)["p1"], damper(cur)["p2"]) - math.dist(damper(prev)["p1"], damper(prev)["p2"])) / 0.001
        assert damper(cur)["force"] == pytest.approx(8.0 * rate, rel=2e-3, abs=2e-3)


def test_a_mass_hanging_on_a_damper_only_reaches_terminal_velocity():
    m, c = 1.5, 6.0
    s = {
        "version": "0.3", "solver": {"dt": 0.001}, "gravity": [0, -G],
        "bodies": [{"id": "m", "type": "block", "position": [0, 0], "params": {"mass": m, "width": 0.2, "height": 0.2}}],
        "elements": [{"id": "d", "type": "damper", "a": {"body": None, "point": [0, 2]},
                      "b": {"body": "m", "point": [0, 0]}, "params": {"c": c}}],
    }
    frames = run(s, 3000)
    assert frames[-1]["bodies"][0]["vy"] == pytest.approx(-m * G / c, rel=1e-3)
    assert frames[-1]["elements"][0]["force"] == pytest.approx(m * G, rel=1e-3)  # tension = weight


def test_zero_damping_is_a_free_spring(load_example):
    s = load_example("spring_damper")
    s["elements"][1]["params"]["c"] = 0.0
    frames = run(s, 3000)
    energy = [f["energy"]["kinetic"] + f["energy"]["potential"] for f in frames]
    assert (max(energy) - min(energy)) / max(f["energy"]["kinetic"] for f in frames) < 0.03
