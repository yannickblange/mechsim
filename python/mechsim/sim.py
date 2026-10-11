"""Pythonic wrapper around a native world. TICKET B5 implements this file.

    with Simulation(scene_dict_or_json_string) as sim:
        sim.step(n=1000)
        print(sim.time, sim.state(), sim.frame())

Implements mechsim.protocol.SimulationLike.
"""
from __future__ import annotations

from typing import Any

import numpy as np


class Simulation:
    def __init__(self, scene: dict[str, Any] | str) -> None:
        raise NotImplementedError("TODO(B5)")

    @property
    def time(self) -> float:
        raise NotImplementedError("TODO(B5)")

    @property
    def dt(self) -> float:
        raise NotImplementedError("TODO(B5)")

    @property
    def body_count(self) -> int:
        raise NotImplementedError("TODO(B5)")

    def step(self, dt: float | None = None, n: int = 1) -> None:
        raise NotImplementedError("TODO(B5)")

    def reset(self) -> None:
        raise NotImplementedError("TODO(B5)")

    def state(self) -> np.ndarray:
        """Array of shape (body_count, 6): x, y, phi, vx, vy, omega."""
        raise NotImplementedError("TODO(B5)")

    def frame(self) -> dict[str, Any]:
        raise NotImplementedError("TODO(B5)")

    def close(self) -> None:
        raise NotImplementedError("TODO(B5)")

    def __enter__(self) -> "Simulation":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
