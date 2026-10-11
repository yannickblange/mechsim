"""Load and validate scene files.

Scene files live in ``scenes/`` (see ``mechsim.paths.SCENES_DIR``) and must
validate against ``contracts/scene.schema.json``.

This module implements scene discovery, loading and schema validation, and
derives the solver time step from the scene definition.

Public API:
    list_scenes() -> list[str]
    load_scene(name: str) -> dict
    validate_scene(scene: dict) -> list[str]
    scene_dt(scene: dict) -> float
"""
from __future__ import annotations

import json
from typing import Any

import jsonschema

from mechsim import paths


class SceneNotFound(KeyError):
    """Raised when a scene file does not exist."""


class SceneInvalid(ValueError):
    """Raised when a scene file does not validate against the scene schema."""


_validator: jsonschema.Draft202012Validator | None = None


def _get_validator() -> jsonschema.Draft202012Validator:
    """Return the scene validator, building it (and loading the schema) once."""
    global _validator
    if _validator is None:
        schema = json.loads(paths.SCENE_SCHEMA.read_text(encoding="utf-8"))
        _validator = jsonschema.Draft202012Validator(schema)
    return _validator


def _error_key(error: jsonschema.ValidationError) -> tuple:
    """Deterministic sort key: (path parts, message)."""
    return (tuple(str(part) for part in error.path), error.message)


def _format_error(error: jsonschema.ValidationError) -> str:
    """Render one validation error as ``<json path>: <message>``.

    Example: ``bodies/0/params/mass: 0 is less than or equal to the minimum of 0``.
    Errors at the root document carry no path.
    """
    path = "/".join(str(part) for part in error.path)
    if path:
        return f"{path}: {error.message}"
    return error.message


def validate_scene(scene: dict[str, Any]) -> list[str]:
    """Validate a scene dict, returning a list of human-readable error strings.

    An empty list means the scene is valid.
    """
    errors = sorted(_get_validator().iter_errors(scene), key=_error_key)
    return [_format_error(error) for error in errors]


def list_scenes() -> list[str]:
    """Return the scene names (file stems) in ``paths.SCENES_DIR``, sorted."""
    return sorted(path.stem for path in paths.SCENES_DIR.glob("*.json") if path.is_file())


def load_scene(name: str) -> dict[str, Any]:
    """Load ``<SCENES_DIR>/<name>.json`` and validate it against the scene schema.

    Raises:
        SceneNotFound: if the scene file does not exist.
        SceneInvalid: if the file does not validate (message lists all errors).
    """
    path = paths.SCENES_DIR / f"{name}.json"
    if not path.is_file():
        raise SceneNotFound(f"scene {name!r} not found in {paths.SCENES_DIR}")
    scene = json.loads(path.read_text(encoding="utf-8"))
    errors = validate_scene(scene)
    if errors:
        raise SceneInvalid(f"scene {name!r} is invalid: " + "; ".join(errors))
    return scene


def scene_dt(scene: dict[str, Any]) -> float:
    """Return the solver time step (``solver.dt``) for a scene, default 0.001 s."""
    solver = scene.get("solver") or {}
    return float(solver.get("dt", 0.001))
