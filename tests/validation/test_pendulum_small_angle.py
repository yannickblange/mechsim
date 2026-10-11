"""Physical pendulum on a Festlager against T = 2 pi sqrt(J_A / (m g d))."""
import math

import pytest

from mechsim.sim import Simulation

from test_harmonic_oscillator import downward_crossings

pytestmark = pytest.mark.native


def test_pendulum_period(load_example):
    m, w, h, d = 2.0, 0.05, 1.0, 0.5
    J = m * (w**2 + h**2) / 12
    expected = 2 * math.pi * math.sqrt((J + m * d**2) / (m * 9.81 * d))

    times, phis = [], []
    with Simulation(load_example("physical_pendulum")) as sim:
        for _ in range(5000):
            sim.step()
            times.append(sim.time)
            phis.append(sim.state()[0][2])

    crossings = downward_crossings(times, phis)
    assert len(crossings) >= 2
    period = (crossings[-1] - crossings[0]) / (len(crossings) - 1)
    assert abs(period - expected) / expected < 0.01
