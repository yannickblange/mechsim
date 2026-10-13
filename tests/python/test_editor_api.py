"""REST endpoints used by the editor: apply, save, user scenes. Mock engine and native engine."""
from __future__ import annotations

import copy

import jsonschema
import pytest
from fastapi.testclient import TestClient

from mechsim.server.app import create_app
from mechsim.server.mock import MockSimulation

from scene_factory import base


@pytest.fixture
def user_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("MECHSIM_USER_SCENES", str(tmp_path / "mine"))
    return tmp_path / "mine"


@pytest.fixture
def client(user_dir):
    with TestClient(create_app(MockSimulation, "mock")) as c:
        yield c


def test_scenes_endpoint_lists_both_groups(client):
    body = client.get("/api/scenes").json()
    assert "incline_roller" in body["scenes"]
    assert body["user_scenes"] == []


def test_apply_makes_the_scene_active(client):
    r = client.post("/api/scene/apply", json={"scene": base(), "name": "draft1"})
    assert r.status_code == 200, r.text
    assert r.json()["source"] == "draft"
    current = client.get("/api/scene").json()
    assert current["name"] == "draft1"
    assert current["source"] == "draft"
    assert current["scene"] == base()


def test_apply_without_name_falls_back_to_scene_name_then_untitled(client):
    client.post("/api/scene/apply", json={"scene": base()})
    assert client.get("/api/scene").json()["name"] == "all new types"
    unnamed = base()
    del unnamed["name"]
    client.post("/api/scene/apply", json={"scene": unnamed})
    assert client.get("/api/scene").json()["name"] == "untitled"


def test_apply_invalid_scene_is_422_and_keeps_previous_scene(client):
    client.post("/api/scene/load", json={"name": "single_mass_spring"})
    broken = copy.deepcopy(base())
    broken["elements"][1]["body"] = "ghost"
    r = client.post("/api/scene/apply", json={"scene": broken})
    assert r.status_code == 422
    assert "ghost" in r.json()["detail"]
    assert client.get("/api/scene").json()["name"] == "single_mass_spring"


def _read_until(ws, predicate, limit=60):
    for _ in range(limit):
        msg = ws.receive_json()
        if predicate(msg):
            return msg
    raise AssertionError("expected message did not arrive")


def test_apply_broadcasts_a_frame_and_pauses(client, state_schema):
    client.post("/api/scene/load", json={"name": "single_mass_spring"})
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"cmd": "play"})
        _read_until(ws, lambda m: m["type"] == "status" and m["running"])
        client.post("/api/scene/apply", json={"scene": base()})
        frame = _read_until(ws, lambda m: m["type"] == "frame" and len(m["data"]["bodies"]) == 3)["data"]
        assert frame["t"] == 0
        jsonschema.validate(frame, state_schema)
        status = _read_until(ws, lambda m: m["type"] == "status")
        assert status["running"] is False
        assert status["scene"] == "all new types"


def test_save_then_list_and_load_user_scene(client, user_dir):
    r = client.post("/api/scene/save", json={"name": "my_layout", "scene": base()})
    assert r.status_code == 200, r.text
    assert r.json() == {"name": "my_layout", "source": "user"}
    assert (user_dir / "my_layout.json").is_file()
    assert client.get("/api/scenes").json()["user_scenes"] == ["my_layout"]

    r = client.post("/api/scene/load", json={"name": "my_layout", "source": "user"})
    assert r.status_code == 200
    assert r.json()["source"] == "user"
    assert r.json()["scene"] == base()
    assert client.get("/api/scene").json()["source"] == "user"


def test_user_scene_is_not_found_in_examples(client):
    client.post("/api/scene/save", json={"name": "only_mine", "scene": base()})
    assert client.post("/api/scene/load", json={"name": "only_mine"}).status_code == 404
    assert client.post("/api/scene/load", json={"name": "only_mine", "source": "bogus"}).status_code == 404


def test_save_rejects_bad_names_and_bad_scenes(client, user_dir):
    assert client.post("/api/scene/save", json={"name": "../x", "scene": base()}).status_code == 422
    assert client.post("/api/scene/save", json={"name": "", "scene": base()}).status_code == 422
    broken = base()
    broken["bodies"][0]["params"]["mass"] = -1
    r = client.post("/api/scene/save", json={"name": "bad", "scene": broken})
    assert r.status_code == 422
    assert "mass" in r.json()["detail"]
    assert not user_dir.exists() or list(user_dir.iterdir()) == []


def test_load_path_traversal_is_404(client):
    r = client.post("/api/scene/load", json={"name": "../scenes/single_mass_spring", "source": "user"})
    assert r.status_code == 404


def test_delete_user_scene_moves_it_to_the_trash_and_unlists_it(client, user_dir):
    client.post("/api/scene/save", json={"name": "gone", "scene": base()})
    client.post("/api/scene/save", json={"name": "stays", "scene": base()})
    r = client.delete("/api/scenes/user/gone")
    assert r.status_code == 200 and r.json() == {"deleted": "gone"}
    assert client.get("/api/scenes").json()["user_scenes"] == ["stays"]
    assert not (user_dir / "gone.json").exists()
    assert (user_dir / ".trash" / "gone.json").is_file()  # kept, not listed: it can be taken back by hand
    assert client.post("/api/scene/load", json={"name": "gone", "source": "user"}).status_code == 404


def test_delete_rejects_unknown_scenes_bad_names_and_never_touches_examples(client, user_dir):
    assert client.delete("/api/scenes/user/never_saved").status_code == 404
    assert client.delete("/api/scenes/user/..%2Fscenes%2Fsingle_mass_spring").status_code in (404, 422)
    examples = client.get("/api/scenes").json()["scenes"]
    assert examples and client.delete(f"/api/scenes/user/{examples[0]}").status_code == 404  # an example name is not a saved scene
    assert client.get("/api/scenes").json()["scenes"] == examples
