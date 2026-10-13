"""Shared server state: current scene, simulation, run loop, connected clients. TICKET B1.

One SimSession per app (stored on app.state.session). Holds:
  scene_name, scene, sim (SimulationLike | None), running, speed, clients (set of WebSockets)
and runs one asyncio task that, while running, advances the simulation at 60 Hz and broadcasts
frames (see contracts/protocol.md).
"""
from __future__ import annotations

import asyncio
import math
import time
from typing import Any

from mechsim.scene import SceneInvalid, load_scene, validate_scene

FRAME_PERIOD = 1.0 / 60.0
SPEED_MIN, SPEED_MAX = 0.05, 4.0
T_MAX_DEFAULT = 10.0  # s, the end of a run when the scene does not say otherwise
T_MAX_MIN, T_MAX_MAX = 0.1, 600.0
SEEK_SAMPLES = 600  # trace samples for a jump on the time bar (a display frame sends at most 120)


class SimSession:
    def __init__(self, sim_factory, mode: str) -> None:
        self.sim_factory = sim_factory
        self.mode = mode
        self.scene_name: str | None = None
        self.scene_source: str = "example"  # "example" | "user" | "draft" (applied, not saved)
        self.scene: dict[str, Any] | None = None
        self.sim = None
        self.running = False
        self.speed = 1.0
        self.t_max = T_MAX_DEFAULT  # the run stops here; the time bar shows t / t_max
        self.clients: set = set()

    def status(self) -> dict[str, Any]:
        return {
            "type": "status",
            "running": self.running,
            "scene": self.scene_name,
            "speed": self.speed,
            "mode": self.mode,
            "t_max": self.t_max,
            "finished": self.finished(),
        }

    async def broadcast(self, msg: dict[str, Any]) -> None:
        for ws in list(self.clients):
            try:
                await ws.send_json(msg)
            except Exception:
                self.clients.discard(ws)

    async def load(self, name: str, source: str = "example") -> None:
        """Load a saved scene by name. Raises SceneNotFound / SceneInvalid, or whatever the engine
        raises; in every error case the previous scene stays active."""
        await self.load_scene_dict(load_scene(name, source), name, source)

    async def load_scene_dict(self, scene: dict[str, Any], name: str, source: str = "draft") -> None:
        """Make `scene` the active scene (used for scenes coming straight from the editor).

        The scene is validated, built, and probed with one step followed by a reset, so engine
        problems that only show up when stepping (for example a singular constraint set) are
        reported now instead of when the user presses Play. In every error case the previous
        scene stays active.
        """
        errors = validate_scene(scene)
        if errors:
            raise SceneInvalid("scene is invalid: " + "; ".join(errors))
        new_sim = self.sim_factory(scene)
        try:
            new_sim.step(n=1)
            new_sim.reset()
        except Exception:
            new_sim.close()
            raise
        if self.sim is not None:
            self.sim.close()
        self.scene_name, self.scene_source, self.scene, self.sim = name, source, scene, new_sim
        self.running = False
        if "t_max" in scene:  # a scene may suggest its own end time; otherwise the chosen one stays
            self.t_max = min(T_MAX_MAX, max(T_MAX_MIN, float(scene["t_max"])))
        await self.broadcast({"type": "frame", "data": new_sim.frame()})
        await self.broadcast(self.status())

    def frame_steps(self) -> int:
        """Engine steps per display frame: speed / 60 s of simulated time."""
        return max(1, round(self.speed / 60 / self.sim.dt))

    def steps_left(self) -> int:
        """Engine steps until t_max (0 once the end of the run is reached)."""
        if self.sim is None:
            return 0
        return max(0, math.floor((self.t_max - self.sim.time) / self.sim.dt + 1e-4))

    def finished(self) -> bool:
        return self.sim is not None and self.steps_left() == 0

    def advance(self) -> dict[str, Any] | None:
        """Run one display frame of engine steps (fewer if t_max comes first); returns the frame
        message, or None if the run is already at t_max. The message carries a `trace` (the pose
        after every engine step, see Simulation.step_traced) when the simulation can produce one,
        so graphs are not limited by the 60 Hz display rate."""
        n = min(self.frame_steps(), self.steps_left())
        if n < 1:
            return None
        return self.stepped(n, max_samples=120)

    def stepped(self, n: int, max_samples: int) -> dict[str, Any]:
        if hasattr(self.sim, "step_traced"):
            trace = self.sim.step_traced(n, max_samples)
        else:
            self.sim.step(n=n)
            trace = None
        msg: dict[str, Any] = {"type": "frame", "data": self.sim.frame()}
        if trace:
            msg["trace"] = trace
        return msg

    async def seek(self, target: float) -> None:
        """Jump to simulated time `target` (the time bar): earlier than now means reset and run
        forward again. The trace of the jump goes along, so the graphs show the whole history."""
        dt = self.sim.dt
        target = min(max(target, 0.0), self.t_max)
        if target < self.sim.time - dt / 2:
            self.sim.reset()
            await self.broadcast({"type": "frame", "data": self.sim.frame()})
        n = min(round((target - self.sim.time) / dt), self.steps_left())
        if n >= 1:
            await self.broadcast(self.stepped(n, max_samples=SEEK_SAMPLES))

    async def command(self, msg: dict[str, Any], ws) -> None:
        cmd = msg.get("cmd") if isinstance(msg, dict) else None
        try:
            await self.execute(cmd, msg, ws)
        except Exception as exc:
            self.running = False
            await ws.send_json({"type": "error", "message": str(exc)})
        await self.broadcast(self.status())

    async def execute(self, cmd: str | None, msg: dict[str, Any], ws) -> None:
        if cmd == "play":
            if self.finished():  # play again from the start, like a video that has ended
                self.sim.reset()
                await self.broadcast({"type": "frame", "data": self.sim.frame()})
            self.running = self.sim is not None
        elif cmd == "pause":
            self.running = False
        elif cmd == "reset":
            if self.sim is not None:
                self.sim.reset()
                await self.broadcast({"type": "frame", "data": self.sim.frame()})
        elif cmd == "step":
            if self.sim is not None and not self.running:
                frame = self.advance()
                if frame is not None:
                    await self.broadcast(frame)
        elif cmd == "seek":
            target = self.number(msg, "seek")
            if self.sim is not None:
                await self.seek(target)
        elif cmd == "speed":
            self.speed = min(SPEED_MAX, max(SPEED_MIN, self.number(msg, "speed")))
        elif cmd == "tmax":
            self.t_max = min(T_MAX_MAX, max(T_MAX_MIN, self.number(msg, "tmax")))
        else:
            await ws.send_json({"type": "error", "message": f"unknown command: {cmd!r}"})

    @staticmethod
    def number(msg: dict[str, Any], cmd: str) -> float:
        try:
            value = float(msg["value"])
        except (KeyError, TypeError, ValueError):
            raise ValueError(f"{cmd} needs a numeric 'value'") from None
        if not math.isfinite(value):
            raise ValueError(f"{cmd} needs a finite 'value'")
        return value

    async def run(self) -> None:
        """Background loop at 60 Hz. Ends only when the task is cancelled."""
        while True:
            t0 = time.perf_counter()
            if self.running and self.sim is not None:
                try:
                    frame = self.advance()
                    if frame is not None:
                        await self.broadcast(frame)
                    if self.finished():  # reached t_max: stop on the last frame
                        self.running = False
                        await self.broadcast(self.status())
                except Exception as exc:
                    self.running = False
                    await self.broadcast({"type": "error", "message": str(exc)})
                    await self.broadcast(self.status())
            await asyncio.sleep(max(0.0, FRAME_PERIOD - (time.perf_counter() - t0)))
