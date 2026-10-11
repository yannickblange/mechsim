"""TICKET B1.2. Tests for scene discovery, loading, and schema validation."""
from __future__ import annotations

import copy
from pathlib import Path

import pytest

from mechsim import scene


REPO_ROOT = Path(__file__).resolve().parents[2]
SCENES_DIR = REPO_ROOT / "scenes"


# --- In-place mutation helpers for the invalid-variant tests ---

def _delete_mass(scene: dict) -> None:
    del scene["bodies"][0]["params"]["mass"]


def _bad_body_type(scene: dict) -> None:
    scene["bodies"][0]["type"] = "sphere"


def _negative_stiffness(scene: dict) -> None:
    scene["elements"][0]["params"]["k"] = -1


def _extra_top_level_key(scene: dict) -> None:
    scene["foo"] = 1


_INVALID_VARIANTS = [
    pytest.param(_delete_mass, id="delete-mass"),
    pytest.param(_bad_body_type, id="bad-body-type"),
    pytest.param(_negative_stiffness, id="negative-k"),
    pytest.param(_extra_top_level_key, id="extra-top-level-key"),
]


def test_every_scene_validates(load_example):
    """Every discovered scene must validate with an empty error list."""
    names = scene.list_scenes()
    assert names, "expected at least one scene in scenes/"
    for name in names:
        errors = scene.validate_scene(load_example(name))
        assert errors == [], f"scene {name!r} should be valid, got: {errors}"


@pytest.mark.parametrize("mutate", _INVALID_VARIANTS)
def test_invalid_single_mass_spring_variants(load_example, mutate):
    """Each hand-broken variant must yield a non-empty error list."""
    broken = copy.deepcopy(load_example("single_mass_spring"))
    mutate(broken)
    errors = scene.validate_scene(broken)
    assert errors, "expected validation errors for a known-invalid scene"


def test_list_scenes_matches_scene_dir():
    """list_scenes() must equal the sorted stems of the scenes/ directory."""
    stems = sorted(p.stem for p in SCENES_DIR.glob("*.json") if p.is_file())
    assert scene.list_scenes() == stems


def test_load_missing_scene_raises():
    """load_scene() for an unknown name must raise SceneNotFound."""
    with pytest.raises(scene.SceneNotFound):
        scene.load_scene("nope")
