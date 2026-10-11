"""Common interface of the native Simulation and the MockSimulation. Complete, frozen for v0.1.

The server only talks to objects satisfying SimulationLike, so it works the same in
native mode (mechsim.sim.Simulation) and mock mode (mechsim.server.mock.MockSimulation).
"""
from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class SimulationLike(Protocol):
    @property
    def time(self) -> float:
        """Simulated time in seconds."""
        ...

    @property
    def dt(self) -> float:
        """Solver step size from the scene (solver.dt, default 0.001)."""
        ...

    def step(self, dt: float | None = None, n: int = 1) -> None:
        """Advance n steps of size dt (None = scene dt)."""
        ...

    def reset(self) -> None:
        """Return to the initial state, t = 0."""
        ...

    def frame(self) -> dict[str, Any]:
        """Current frame as a dict matching contracts/state.schema.json."""
        ...

    def close(self) -> None:
        """Release resources. Safe to call twice."""
        ...
