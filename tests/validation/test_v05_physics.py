"""v0.5 example scene against theory: the resonance case of the forced vibration (eta = 1, small zeta)."""
from __future__ import annotations

import math

import numpy as np
import pytest

from test_v04_physics import peaks, trajectory

pytestmark = pytest.mark.native


def parameters(scene):
    k = scene["elements"][0]["params"]["k"]
    m = scene["bodies"][0]["params"]["mass"]
    c = scene["elements"][1]["params"]["c"]
    force = scene["elements"][2]["params"]
    omega0 = math.sqrt(k / m)
    return k, m, c, force["force"][0], 2 * math.pi * force["frequency"], omega0, c / (2 * math.sqrt(k * m))


def test_resonance_is_excited_at_the_natural_frequency_with_a_small_damping_ratio(load_example):
    scene = load_example("resonance")
    k, m, c, F0, Omega, omega0, zeta = parameters(scene)
    assert Omega == pytest.approx(omega0, rel=1e-6)  # eta = 1
    assert zeta == pytest.approx(0.02, rel=1e-4)
    assert F0 / (2 * zeta * k) / (F0 / k) == pytest.approx(25.0, rel=1e-4)  # magnification factor V = 1 / (2 zeta)
    assert scene["t_max"] == 30


def test_resonance_amplitude_grows_like_the_exact_solution_to_V_times_the_static_deflection(load_example):
    scene = load_example("resonance")
    k, m, c, F0, Omega, omega0, zeta = parameters(scene)
    X = F0 / (c * Omega)  # steady-state amplitude at eta = 1: F0 / (2 zeta k)
    sigma, omega_d = zeta * omega0, omega0 * math.sqrt(1 - zeta**2)
    t, x = trajectory(scene, scene["t_max"])
    # x(t) = X [exp(-sigma t) (cos(omega_d t) + sigma/omega_d sin(omega_d t)) - cos(Omega t)] from rest
    exact = X * (np.exp(-sigma * t) * (np.cos(omega_d * t) + sigma / omega_d * np.sin(omega_d * t)) - np.cos(Omega * t))
    assert np.max(np.abs(x - exact)) < 0.02 * X
    # the swings get bigger from period to period until they approach V * F0/k = 1.27 m
    tp, xp = peaks(t, np.abs(x))
    assert np.all(np.diff(xp) > -0.02 * X)
    assert xp[0] < 0.1 * X and xp[-1] == pytest.approx(X * (1 - math.exp(-sigma * tp[-1])), rel=0.03)
    assert np.abs(x).max() > 0.95 * X
    assert np.abs(x).max() < 0.4 * 4.0  # stays between the walls (the springs reach 2.0 - 0.2 m)
    assert np.abs(x).max() > 20 * F0 / k  # far beyond the static deflection
