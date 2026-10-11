"""Mass on a linear spring against the analytic solution (omega0 = sqrt(k/m))."""
import math

import pytest

from mechsim.sim import Simulation

pytestmark = pytest.mark.native


def downward_crossings(times, values):
    """Times at which `values` goes from > 0 to <= 0 (linearly interpolated)."""
    out = []
    for i in range(1, len(values)):
        if values[i - 1] > 0 >= values[i]:
            frac = values[i - 1] / (values[i - 1] - values[i])
            out.append(times[i - 1] + frac * (times[i] - times[i - 1]))
    return out


def test_harmonic_oscillator(load_example):
    k, m = 100.0, 1.0
    y_eq = 1.0 - 0.1 - (0.5 + 9.81 / k)  # spring tension balances the weight
    expected_period = 2 * math.pi / math.sqrt(k / m)

    times, ys, xs, phis = [], [], [], []
    with Simulation(load_example("single_mass_spring")) as sim:
        for _ in range(3000):
            sim.step()
            x, y, phi = sim.state()[0][:3]
            times.append(sim.time)
            xs.append(x)
            ys.append(y)
            phis.append(phi)

    rel = [y - y_eq for y in ys]
    crossings = downward_crossings(times, rel)
    assert len(crossings) >= 3
    period = (crossings[-1] - crossings[0]) / (len(crossings) - 1)
    assert abs(period - expected_period) / expected_period < 0.005

    n = round(expected_period / 0.001)
    first = max(abs(v) for v in rel[:n])
    last = max(abs(v) for v in rel[-n:])
    assert abs(last - first) / first < 0.01

    assert max(abs(x) for x in xs) < 1e-9
    assert max(abs(p) for p in phis) < 1e-9
