"""Shared server state: current scene, simulation, run loop, connected clients. TICKET B1.

One SimSession per app (stored on app.state.session). Holds:
  scene_name, scene, sim (SimulationLike | None), running, speed, clients (set of WebSockets)
and runs one asyncio task that, while running, advances the simulation at 60 Hz and broadcasts
frames (see contracts/protocol.md).
"""
from __future__ import annotations


class SimSession:
    def __init__(self, sim_factory, mode: str) -> None:
        raise NotImplementedError("TODO(B1)")
