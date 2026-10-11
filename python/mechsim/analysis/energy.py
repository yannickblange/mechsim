"""Energy helpers for validation tests. TICKET A7 implements this file.

- total_energy(frame: dict) -> float           kinetic + potential
- energy_drift(frames: list[dict]) -> float    max |E - E0| / max(|E0|, 1e-12)
"""
from __future__ import annotations

from typing import Any


def total_energy(frame: dict[str, Any]) -> float:
    raise NotImplementedError("TODO(A7)")


def energy_drift(frames: list[dict[str, Any]]) -> float:
    raise NotImplementedError("TODO(A7)")
