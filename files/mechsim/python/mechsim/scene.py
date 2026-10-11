"""Scene files: list, load, validate. TICKET B1 implements this file.

- list_scenes() -> sorted list of names (file stems) in paths.SCENES_DIR
- load_scene(name) -> dict; raises SceneNotFound if missing, SceneInvalid if schema fails
- validate_scene(scene: dict) -> list[str] of human readable errors ([] if valid),
  using jsonschema Draft202012Validator with contracts/scene.schema.json (load schema once)
- scene_dt(scene: dict) -> float, solver.dt or 0.001
"""
from __future__ import annotations

from typing import Any


class SceneNotFound(KeyError):
    pass


class SceneInvalid(ValueError):
    pass


def list_scenes() -> list[str]:
    raise NotImplementedError("TODO(B1)")


def load_scene(name: str) -> dict[str, Any]:
    raise NotImplementedError("TODO(B1)")


def validate_scene(scene: dict[str, Any]) -> list[str]:
    raise NotImplementedError("TODO(B1)")


def scene_dt(scene: dict[str, Any]) -> float:
    raise NotImplementedError("TODO(B1)")
