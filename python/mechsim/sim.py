"""Pythonic wrapper around a native world.

    with Simulation(scene_dict_or_json_string) as sim:
        sim.step(n=1000)
        print(sim.time, sim.state(), sim.frame())

Implements mechsim.protocol.SimulationLike.
"""
from __future__ import annotations

import ctypes
import json
from typing import Any

import numpy as np

from mechsim import _native

_DEFAULT_DT = 0.001


class Simulation:
    def __init__(self, scene: dict[str, Any] | str) -> None:
        self._handle = None  # set first so __del__ is safe if construction fails
        lib = _native.load()
        text = scene if isinstance(scene, str) else json.dumps(scene)
        try:
            parsed = json.loads(text)
            solver = parsed.get("solver", {}) if isinstance(parsed, dict) else {}
            self._dt = float(solver.get("dt", _DEFAULT_DT))
        except (ValueError, TypeError, AttributeError):
            self._dt = _DEFAULT_DT  # the engine will report the real parse error
        handle = lib.ms_world_create(text.encode("utf-8"))
        if not handle:
            raise _native.NativeError(_native.last_error())
        self._handle = handle

    def _live(self):
        if self._handle is None:
            raise RuntimeError("simulation is closed")
        return _native.load(), self._handle

    @property
    def time(self) -> float:
        lib, handle = self._live()
        return lib.ms_world_time(handle)

    @property
    def dt(self) -> float:
        self._live()
        return self._dt

    @property
    def body_count(self) -> int:
        lib, handle = self._live()
        return _native.check(lib.ms_world_body_count(handle))

    def step(self, dt: float | None = None, n: int = 1) -> None:
        lib, handle = self._live()
        if n < 1:
            raise ValueError("n must be >= 1")
        _native.check(lib.ms_world_step(handle, dt or 0.0, n))

    def reset(self) -> None:
        lib, handle = self._live()
        _native.check(lib.ms_world_reset(handle))

    def state(self) -> np.ndarray:
        """Array of shape (body_count, 6): x, y, phi, vx, vy, omega."""
        lib, handle = self._live()
        n = self.body_count
        buf = (ctypes.c_double * (_native.MS_STATE_STRIDE * n))()
        _native.check(lib.ms_world_get_state(handle, buf, len(buf)))
        return np.array(buf).reshape(n, _native.MS_STATE_STRIDE)

    def frame(self) -> dict[str, Any]:
        lib, handle = self._live()
        raw = lib.ms_world_frame_json(handle)
        if raw is None:
            raise _native.NativeError(_native.last_error())
        return json.loads(raw.decode("utf-8"))

    def close(self) -> None:
        if self._handle is not None:
            handle, self._handle = self._handle, None
            _native.load().ms_world_destroy(handle)

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass

    def __enter__(self) -> "Simulation":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
