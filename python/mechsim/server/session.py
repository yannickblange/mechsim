"""Shared server state: current scene, simulation, run loop, connected clients. TICKET B1.

One SimSession per app (stored on app.state.session). Holds:
  scene_name, scene, sim (SimulationLike | None), running, speed, clients (set of WebSockets)
and runs one asyncio task that, while running, advances the simulation at 60 Hz and broadcasts
frames (see contracts/protocol.md).
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

from mechsim.scene import load_scene

FRAME_PERIOD = 1.0 / 60.0
SPEED_MIN, SPEED_MAX = 0.05, 4.0


class SimSession:
    def __init__(self, sim_factory, mode: str) -> None:
        self.sim_factory = sim_factory
        self.mode = mode
        self.scene_name: str | None = None
        self.scene: dict[str, Any] | None = None
        self.sim = None
        self.running = False
        self.speed = 1.0
        self.clients: set = set()

    def status(self) -> dict[str, Any]:
        return {
            "type": "status",
            "running": self.running,
            "scene": self.scene_name,
            "speed": self.speed,
            "mode": self.mode,
        }

    async def broadcast(self, msg: dict[str, Any]) -> None:
        for ws in list(self.clients):
            try:
                await ws.send_json(msg)
            except Exception:
                self.clients.discard(ws)

    async def load(self, name: str) -> None:
        """Load a scene by name. Raises SceneNotFound / SceneInvalid, or whatever the engine raises;
        in every error case the previous scene stays active."""
        scene = load_scene(name)
        new_sim = self.sim_factory(scene)
        if self.sim is not None:
            self.sim.close()
        self.scene_name, self.scene, self.sim = name, scene, new_sim
        self.running = False
        await self.broadcast({"type": "frame", "data": new_sim.frame()})
        await self.broadcast(self.status())

    def frame_steps(self) -> int:
        """Engine steps per display frame: speed / 60 s of simulated time."""
        return max(1, round(self.speed / 60 / self.sim.dt))

    async def command(self, msg: dict[str, Any], ws) -> None:
        cmd = msg.get("cmd") if isinstance(msg, dict) else None
        if cmd == "play":
            self.running = self.sim is not None
        elif cmd == "pause":
            self.running = False
        elif cmd == "reset":
            if self.sim is not None:
                self.sim.reset()
                await self.broadcast({"type": "frame", "data": self.sim.frame()})
        elif cmd == "step":
            if self.sim is not None and not self.running:
                try:
                    self.sim.step(n=self.frame_steps())
                except Exception as exc:
                    await ws.send_json({"type": "error", "message": str(exc)})
                else:
                    await self.broadcast({"type": "frame", "data": self.sim.frame()})
        elif cmd == "speed":
            try:
                value = float(msg["value"])
            except (KeyError, TypeError, ValueError):
                await ws.send_json({"type": "error", "message": "speed needs a numeric 'value'"})
            else:
                self.speed = min(SPEED_MAX, max(SPEED_MIN, value))
        else:
            await ws.send_json({"type": "error", "message": f"unknown command: {cmd!r}"})
        await self.broadcast(self.status())

    async def run(self) -> None:
        """Background loop at 60 Hz. Ends only when the task is cancelled."""
        while True:
            t0 = time.perf_counter()
            if self.running and self.sim is not None:
                try:
                    self.sim.step(n=self.frame_steps())
                    await self.broadcast({"type": "frame", "data": self.sim.frame()})
                except Exception as exc:
                    self.running = False
                    await self.broadcast({"type": "error", "message": str(exc)})
                    await self.broadcast(self.status())
            await asyncio.sleep(max(0.0, FRAME_PERIOD - (time.perf_counter() - t0)))
