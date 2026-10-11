"""Energy helpers for validation tests.

- total_energy(frame: dict) -> float           kinetic + potential
- energy_drift(frames: list[dict]) -> float    (max E - min E) / max(peak kinetic, 1e-12)

The drift is normalised by the peak kinetic energy because the zero level of the potential
energy is arbitrary.
"""
from __future__ import annotations

from typing import Any


def total_energy(frame: dict[str, Any]) -> float:
    energy = frame["energy"]
    return energy["kinetic"] + energy["potential"]


def energy_drift(frames: list[dict[str, Any]]) -> float:
    totals = [total_energy(f) for f in frames]
    peak_kinetic = max(f["energy"]["kinetic"] for f in frames)
    return (max(totals) - min(totals)) / max(peak_kinetic, 1e-12)
