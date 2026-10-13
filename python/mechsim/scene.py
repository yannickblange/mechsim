"""Load and validate scene files.

Scene files live in ``scenes/`` (see ``mechsim.paths.SCENES_DIR``) and must
validate against ``contracts/scene.schema.json``.

This module implements scene discovery, loading and schema validation, and
derives the solver time step from the scene definition.

Example scenes live in ``scenes/``; scenes saved from the editor live in ``user_scenes/`` (override
with the ``MECHSIM_USER_SCENES`` environment variable). Both use the same format.

Public API:
    list_scenes() -> list[str]                          example scenes
    list_user_scenes() -> list[str]                     scenes saved by the user
    load_scene(name: str, source: str = "example") -> dict
    save_user_scene(name: str, scene: dict) -> str
    delete_user_scene(name: str) -> None                move a saved scene to user_scenes/.trash/
    validate_scene(scene: dict) -> list[str]            schema errors, then reference errors
    scene_dt(scene: dict) -> float
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

import jsonschema

from mechsim import paths


class SceneNotFound(KeyError):
    """Raised when a scene file does not exist."""


class SceneInvalid(ValueError):
    """Raised when a scene does not validate against the scene schema or has dangling references."""


class SceneNameInvalid(ValueError):
    """Raised for scene names that are not safe file stems (letters, digits, _ and -, 1-64 chars)."""


SOURCES = ("example", "user")
_NAME_RE = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")


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


def _matching_branch(error: jsonschema.ValidationError) -> list[jsonschema.ValidationError]:
    """For a failed ``oneOf`` (the cross sections): the errors of the branch whose ``type`` matched.

    "{...} is not valid under any of the given schemas" does not say what is wrong; the branch of the
    section type that was written does ("'tw' is a required property").
    """
    branches: dict[Any, list[jsonschema.ValidationError]] = {}
    for sub in error.context or []:
        branches.setdefault(sub.schema_path[0], []).append(sub)
    for subs in branches.values():
        wrong_type = any(
            "type" in list(sub.schema_path) and sub.validator in ("const", "enum") for sub in subs
        )
        if not wrong_type:
            return subs
    return []


def _format_error(error: jsonschema.ValidationError) -> str:
    """Render one validation error as ``<json path>: <message>``.

    Example: ``bodies/0/params/mass: 0 is less than or equal to the minimum of 0``.
    Errors at the root document carry no path.
    """
    if error.validator == "oneOf":
        matching = _matching_branch(error)
        if matching:
            return "; ".join(_format_error_at(error, sub) for sub in matching)
        if isinstance(error.instance, dict) and "type" in error.instance and list(error.path)[-1:] == ["section"]:
            path = "/".join(str(part) for part in error.path)
            return f"{path}: unknown section type {error.instance['type']!r} (square, L, T, H, I)"
    path = "/".join(str(part) for part in error.path)
    if path:
        return f"{path}: {error.message}"
    return error.message


def _format_error_at(parent: jsonschema.ValidationError, sub: jsonschema.ValidationError) -> str:
    path = "/".join(str(part) for part in [*parent.path, *sub.path])
    return f"{path}: {sub.message}" if path else sub.message


def _duplicates(ids: list[str]) -> list[str]:
    return sorted({i for i in ids if ids.count(i) > 1})


def section_error(section: dict[str, Any]) -> str | None:
    """Why a (schema-valid) cross section cannot exist, or None. Mirrors native/engine/core/section.cpp."""
    kind = section["type"]
    if kind in ("I", "H"):
        if not 2 * section["tf"] < section["h"]:
            return "the flanges (2 tf) must be thinner than the height h"
        if not section["tw"] < section["b"]:
            return "the web thickness tw must be smaller than the width b"
    elif kind == "T":
        if not section["tf"] < section["h"]:
            return "the flange thickness tf must be smaller than the height h"
        if not section["tw"] < section["b"]:
            return "the stem width tw must be smaller than the flange width b"
    elif kind == "L":
        if not section["t"] < section["b"]:
            return "the thickness t must be smaller than the foot width b"
        if not section["t"] < section["h"]:
            return "the thickness t must be smaller than the leg height h"
    return None


def check_references(scene: dict[str, Any]) -> list[str]:
    """Problems the JSON schema cannot express: duplicate ids, dangling body / surface references,
    cross sections that do not fit, attachments outside a beam.

    Assumes the scene already passed the schema.
    """
    errors: list[str] = []
    bodies = scene.get("bodies", [])
    elements = scene.get("elements", [])
    constraints = scene.get("constraints", [])
    surfaces = scene.get("surfaces", [])

    # The engine shares one id namespace for bodies, elements and constraints.
    for dup in _duplicates([o["id"] for o in bodies + elements + constraints]):
        errors.append(f"duplicate id '{dup}'")
    for dup in _duplicates([o["id"] for o in surfaces]):
        errors.append(f"duplicate surface id '{dup}'")

    body_ids = {b["id"] for b in bodies}
    surface_ids = {s["id"] for s in surfaces}
    beams = {b["id"]: b["params"]["length"] for b in bodies if b["type"] == "beam"}

    for body in bodies:
        if body["type"] == "beam":
            problem = section_error(body["params"]["section"])
            if problem:
                errors.append(f"beam '{body['id']}': {problem}")

    def need_body(owner: str, body_id: str | None, point: list[float] | None = None) -> None:
        if body_id is not None and body_id not in body_ids:
            errors.append(f"'{owner}' refers to unknown body '{body_id}'")
        elif body_id in beams and point is not None and abs(point[0]) > beams[body_id] / 2 + 1e-6:
            errors.append(
                f"'{owner}' is attached to beam '{body_id}' at x = {point[0]} m, outside the beam "
                f"(length {beams[body_id]} m)"
            )

    for element in elements:
        if element["type"] == "bar":
            problem = section_error(element["params"]["section"])
            if problem:
                errors.append(f"bar '{element['id']}': {problem}")
        if element["type"] in ("spring", "damper", "bar"):
            ends = [element["a"]["body"], element["b"]["body"]]
            for end in ("a", "b"):
                need_body(element["id"], element[end]["body"], element[end]["point"])
            if element["type"] in ("damper", "bar"):
                if ends[0] == ends[1]:
                    errors.append(
                        f"'{element['id']}' connects "
                        + ("the same mass to itself" if ends[0] is not None else "two points of the ground")
                    )
        else:
            need_body(element["id"], element["body"], element["point"])
    for constraint in constraints:
        kind = constraint["type"]
        if kind in ("rope", "rod", "pin_joint", "fixed_joint"):
            ends = [constraint["a"]["body"], constraint["b"]["body"]]
            for end in ("a", "b"):
                need_body(constraint["id"], constraint[end]["body"], constraint[end]["point"])
            if ends[0] == ends[1]:
                errors.append(
                    f"'{constraint['id']}' connects "
                    + ("the same mass to itself" if ends[0] is not None else "two points of the ground")
                )
            continue
        need_body(constraint["id"], constraint["body"], constraint["point"])  # None = Festlager in free space
        ref = constraint.get("surface")
        if ref is not None and ref not in surface_ids:
            errors.append(f"'{constraint['id']}' refers to unknown surface '{ref}'")
    for surface in surfaces:
        if surface["p1"] == surface["p2"]:
            errors.append(f"surface '{surface['id']}' has zero length")
    return errors


def validate_scene(scene: dict[str, Any]) -> list[str]:
    """Validate a scene dict, returning a list of human-readable error strings.

    Schema errors come first; reference checks (see check_references) only run on schema-valid
    scenes. An empty list means the scene is valid.
    """
    errors = sorted(_get_validator().iter_errors(scene), key=_error_key)
    if errors:
        return [_format_error(error) for error in errors]
    return check_references(scene)


def user_scenes_dir() -> Path:
    """Directory of user-saved scenes, read on every call so tests can override the variable."""
    return Path(os.environ.get("MECHSIM_USER_SCENES", paths.REPO_ROOT / "user_scenes"))


def _stems(directory: Path) -> list[str]:
    return sorted(path.stem for path in directory.glob("*.json") if path.is_file())


def list_scenes() -> list[str]:
    """Return the example scene names (file stems) in ``paths.SCENES_DIR``, sorted."""
    return _stems(paths.SCENES_DIR)


def list_user_scenes() -> list[str]:
    """Return the names of the scenes saved by the user, sorted (empty if none yet)."""
    directory = user_scenes_dir()
    return _stems(directory) if directory.is_dir() else []


def check_name(name: str) -> str:
    """Return ``name`` if it is a safe file stem, else raise SceneNameInvalid."""
    if not isinstance(name, str) or not _NAME_RE.match(name):
        raise SceneNameInvalid("scene names may use letters, digits, '_' and '-' (1-64 characters)")
    return name


def load_scene(name: str, source: str = "example") -> dict[str, Any]:
    """Load ``<dir>/<name>.json`` of the given source and validate it against the scene schema.

    Raises:
        SceneNotFound: if the source is unknown or the scene file does not exist.
        SceneInvalid: if the file does not validate (message lists all errors).
    """
    if source not in SOURCES:
        raise SceneNotFound(f"unknown scene source {source!r}")
    directory = paths.SCENES_DIR if source == "example" else user_scenes_dir()
    try:
        check_name(name)
    except SceneNameInvalid as exc:  # never build a path from an unchecked name
        raise SceneNotFound(str(exc)) from exc
    path = directory / f"{name}.json"
    if not path.is_file():
        raise SceneNotFound(f"scene {name!r} not found in {directory}")
    scene = json.loads(path.read_text(encoding="utf-8"))
    errors = validate_scene(scene)
    if errors:
        raise SceneInvalid(f"scene {name!r} is invalid: " + "; ".join(errors))
    return scene


def save_user_scene(name: str, scene: dict[str, Any]) -> str:
    """Validate ``scene`` and write it to ``<user_scenes_dir>/<name>.json`` (overwrites).

    Raises:
        SceneNameInvalid: if ``name`` is not a safe file stem.
        SceneInvalid: if the scene does not validate; nothing is written.
    """
    check_name(name)
    errors = validate_scene(scene)
    if errors:
        raise SceneInvalid("scene is invalid: " + "; ".join(errors))
    directory = user_scenes_dir()
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{name}.json"
    tmp = directory / f".{name}.json.tmp"
    tmp.write_text(json.dumps(scene, indent=2) + "\n", encoding="utf-8")
    tmp.replace(target)  # atomic: a crash never leaves a half-written layout
    return name


def delete_user_scene(name: str) -> None:
    """Delete the saved scene ``name``. The file is moved to ``<user_scenes_dir>/.trash/`` (not listed, so it can be
    taken back by hand), an older trashed scene of the same name is replaced.

    Raises:
        SceneNameInvalid: if ``name`` is not a safe file stem (no path is ever built from it).
        SceneNotFound: if there is no such saved scene. Examples cannot be deleted.
    """
    check_name(name)
    directory = user_scenes_dir()
    source = directory / f"{name}.json"
    if not source.is_file():
        raise SceneNotFound(f"scene {name!r} not found in {directory}")
    trash = directory / ".trash"
    trash.mkdir(exist_ok=True)
    source.replace(trash / f"{name}.json")


def scene_dt(scene: dict[str, Any]) -> float:
    """Return the solver time step (``solver.dt``) for a scene, default 0.001 s."""
    solver = scene.get("solver") or {}
    return float(solver.get("dt", 0.001))
