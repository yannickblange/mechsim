"""v0.2 scene format: new types, reference checks, and saving / loading user scenes."""
from __future__ import annotations

import copy
import json

import pytest

from mechsim import scene
from scene_factory import base


def test_all_new_types_validate():
    assert scene.validate_scene(base()) == []


def test_version_01_scenes_still_validate(load_example):
    s = load_example("single_mass_spring")
    assert s["version"] == "0.1"
    assert scene.validate_scene(s) == []


@pytest.mark.parametrize(
    "mutate, fragment",
    [
        (lambda s: s["bodies"][1]["params"].update(radius=0), "radius"),
        (lambda s: s["bodies"][1]["params"].pop("mass"), "mass"),
        (lambda s: s["bodies"][1]["params"].update(width=1), "width"),  # block param on a disc
        (lambda s: s["bodies"][0]["params"].update(radius=1), "radius"),  # disc param on a block
        (lambda s: s["elements"][1]["params"].update(mode="ramp"), "mode"),
        (lambda s: s["elements"][1]["params"].update(force=[1]), "force"),
        (lambda s: s["elements"][1].pop("point"), "point"),
        (lambda s: s["elements"][1].update(a={"body": None, "point": [0, 0]}), "a"),  # load with spring field
        (lambda s: s["elements"][0].update(body="m1", point=[0, 0]), "body"),  # spring with load field
        (lambda s: s["elements"][0].pop("b"), "b"),
        (lambda s: s["constraints"][2]["params"].update(friction=0.3), "friction"),
        (lambda s: s["constraints"][0].update(type="slider"), "slider"),
        (lambda s: s["surfaces"][0].pop("p2"), "p2"),
        (lambda s: s.update(version="0.3"), "0.3"),
    ],
)
def test_invalid_variants_are_rejected(mutate, fragment):
    broken = copy.deepcopy(base())
    mutate(broken)
    errors = scene.validate_scene(broken)
    assert errors, "expected validation errors"
    assert any(fragment in e for e in errors), errors


@pytest.mark.parametrize(
    "mutate, fragment",
    [
        (lambda s: s["elements"][1].update(body="ghost"), "unknown body 'ghost'"),
        (lambda s: s["elements"][0]["a"].update(body="ghost"), "unknown body 'ghost'"),
        (lambda s: s["constraints"][0].update(body="ghost"), "unknown body 'ghost'"),
        (lambda s: s["constraints"][0].update(surface="nowhere"), "unknown surface 'nowhere'"),
        (lambda s: s["constraints"][1].update(id="A"), "duplicate id 'A'"),
        (lambda s: s["bodies"][1].update(id="m1"), "duplicate id 'm1'"),
        (lambda s: s["surfaces"].append({"id": "s1", "p1": [0, 1], "p2": [1, 1]}), "duplicate surface id 's1'"),
        (lambda s: s["surfaces"][0].update(p2=[0, 0]), "zero length"),
    ],
)
def test_reference_errors(mutate, fragment):
    broken = copy.deepcopy(base())
    mutate(broken)
    errors = scene.validate_scene(broken)
    assert any(fragment in e for e in errors), errors


def test_surface_and_body_may_share_an_id():
    s = base()
    s["surfaces"][0]["id"] = "m1"
    s["constraints"][0]["surface"] = "m1"
    assert scene.validate_scene(s) == []


# --- user scenes -----------------------------------------------------------------------------


@pytest.fixture
def user_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("MECHSIM_USER_SCENES", str(tmp_path / "mine"))
    return tmp_path / "mine"


def test_user_dir_is_created_on_first_save_and_listed(user_dir):
    assert scene.list_user_scenes() == []
    assert not user_dir.exists()
    assert scene.save_user_scene("first", base()) == "first"
    scene.save_user_scene("second_try-2", base())
    assert scene.list_user_scenes() == ["first", "second_try-2"]
    assert scene.list_scenes() != scene.list_user_scenes()  # examples are unaffected


def test_save_then_load_round_trips(user_dir):
    original = base()
    scene.save_user_scene("mine", original)
    assert scene.load_scene("mine", "user") == original
    with pytest.raises(scene.SceneNotFound):
        scene.load_scene("mine", "example")


def test_save_overwrites_without_leaving_temp_files(user_dir):
    scene.save_user_scene("mine", base())
    changed = base()
    changed["name"] = "changed"
    scene.save_user_scene("mine", changed)
    assert scene.load_scene("mine", "user")["name"] == "changed"
    assert [p.name for p in user_dir.iterdir()] == ["mine.json"]


def test_invalid_scene_is_not_written(user_dir):
    broken = base()
    broken["constraints"][0]["body"] = "ghost"
    with pytest.raises(scene.SceneInvalid, match="ghost"):
        scene.save_user_scene("bad", broken)
    assert scene.list_user_scenes() == []


@pytest.mark.parametrize("name", ["", "a b", "../escape", "a/b", "a.json", "x" * 65, "ü", ".hidden", "a\\b"])
def test_unsafe_names_are_rejected(user_dir, name):
    with pytest.raises(scene.SceneNameInvalid):
        scene.save_user_scene(name, base())
    with pytest.raises(scene.SceneNotFound):  # loading never builds a path from an unchecked name
        scene.load_scene(name, "user")
    assert not user_dir.exists() or list(user_dir.iterdir()) == []


def test_unknown_source_is_not_found():
    with pytest.raises(scene.SceneNotFound):
        scene.load_scene("single_mass_spring", "elsewhere")


def test_saved_file_is_plain_json(user_dir):
    scene.save_user_scene("mine", base())
    text = (user_dir / "mine.json").read_text(encoding="utf-8")
    assert text.endswith("\n")
    assert json.loads(text) == base()
