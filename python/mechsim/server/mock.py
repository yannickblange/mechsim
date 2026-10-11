"""MockSimulation: fake physics so the frontend works without the native library. TICKET B1.

Implements mechsim.protocol.SimulationLike for ANY valid v0.1 scene:
- each body oscillates around its initial position: y(t) = y0 + 0.05 sin(2 pi t),
  phi(t) = phi0 + 0.1 sin(2 pi t); x stays at x0; velocities are the analytic derivatives
- spring p1/p2: anchor positions computed from the current mock body poses
  (ground anchors: world point; body anchors: pos + R(phi) * point); force = 0.0
- pin_support position: initial world position of its body point; reaction = [0.0, 0.0]
- energy: {"kinetic": 0.0, "potential": 0.0}
Frames must validate against contracts/state.schema.json.
"""
from __future__ import annotations

import math
from typing import Any

from mechsim.scene import scene_dt

# Amplitude (m / rad) and angular frequency (rad/s) of the mock oscillation.
_AMP_Y = 0.05
_AMP_PHI = 0.1
_FREQ = 2.0 * math.pi


class MockSimulation:
    def __init__(self, scene: dict[str, Any]) -> None:
        self._scene = scene
        self._bodies = {body["id"]: body for body in scene["bodies"]}
        self._dt = scene_dt(scene)
        self._time = 0.0
        self._closed = False

    @property
    def time(self) -> float:
        return self._time

    @property
    def dt(self) -> float:
        return self._dt

    def reset(self) -> None:
        self._check_open()
        self._time = 0.0

    def step(self, dt: float | None = None, n: int = 1) -> None:
        self._check_open()
        self._time += n * (dt if dt is not None else self._dt)

    def close(self) -> None:
        self._closed = True

    def frame(self) -> dict[str, Any]:
        self._check_open()
        t = self._time
        bodies = []
        for body in self._scene["bodies"]:
            x, y, phi, vx, vy, omega = self._pose(body, t)
            bodies.append(
                {
                    "id": body["id"],
                    "x": x,
                    "y": y,
                    "phi": phi,
                    "vx": vx,
                    "vy": vy,
                    "omega": omega,
                }
            )
        elements = []
        for element in self._scene["elements"]:
            elements.append(
                {
                    "id": element["id"],
                    "type": element["type"],
                    "p1": self._anchor_world(element["a"], t),
                    "p2": self._anchor_world(element["b"], t),
                    "force": 0.0,
                }
            )
        constraints = []
        for constraint in self._scene["constraints"]:
            constraints.append(
                {
                    "id": constraint["id"],
                    "type": constraint["type"],
                    "position": self._constraint_point(constraint),
                    "reaction": [0.0, 0.0],
                }
            )
        return {
            "t": t,
            "bodies": bodies,
            "elements": elements,
            "constraints": constraints,
            "energy": {"kinetic": 0.0, "potential": 0.0},
        }

    def _check_open(self) -> None:
        if self._closed:
            raise RuntimeError(f"MockSimulation({self._scene.get('name', '?')}) is closed")

    def _pose(self, body: dict[str, Any], t: float) -> tuple[float, float, float, float, float, float]:
        x0, y0 = body["position"]
        # Mock motion: x fixed; y and phi oscillate about their initial values;
        # vy/omega are the analytic time derivatives.
        phi0 = float(body.get("angle", 0.0))
        y = y0 + _AMP_Y * math.sin(_FREQ * t)
        phi = phi0 + _AMP_PHI * math.sin(_FREQ * t)
        vy = _AMP_Y * _FREQ * math.cos(_FREQ * t)
        omega = _AMP_PHI * _FREQ * math.cos(_FREQ * t)
        return x0, y, phi, 0.0, vy, omega

    def _anchor_world(self, anchor: dict[str, Any], t: float) -> list[float]:
        if anchor["body"] is None:
            px, py = anchor["point"]
            return [px, py]
        x, y, phi, _, _, _ = self._pose(self._bodies[anchor["body"]], t)
        return self._to_world(x, y, phi, anchor["point"])

    def _constraint_point(self, constraint: dict[str, Any]) -> list[float]:
        # Fixed in the mock: world position of the point at t = 0.
        x, y, phi, _, _, _ = self._pose(self._bodies[constraint["body"]], 0.0)
        return self._to_world(x, y, phi, constraint["point"])

    @staticmethod
    def _to_world(x: float, y: float, phi: float, point: list[float]) -> list[float]:
        # Body frame -> world: p = pos + R(phi) * point, R(phi) = [[c, -s], [s, c]].
        cx, sx = math.cos(phi), math.sin(phi)
        px, py = point
        return [x + cx * px - sx * py, y + sx * px + cx * py]
