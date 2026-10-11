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

from typing import Any


class MockSimulation:
    def __init__(self, scene: dict[str, Any]) -> None:
        raise NotImplementedError("TODO(B1)")
