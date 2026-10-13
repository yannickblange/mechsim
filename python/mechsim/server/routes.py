"""REST endpoints (contracts/protocol.md)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

import mechsim
from mechsim.scene import (
    SceneInvalid,
    SceneNameInvalid,
    SceneNotFound,
    check_name,
    delete_user_scene,
    list_scenes,
    list_user_scenes,
    save_user_scene,
)

router = APIRouter(prefix="/api")


class LoadRequest(BaseModel):
    name: str
    source: str = "example"  # "example" | "user"


class ApplyRequest(BaseModel):
    scene: dict[str, Any]
    name: str | None = None


class SaveRequest(BaseModel):
    name: str
    scene: dict[str, Any]


@router.get("/health")
async def health(request: Request):
    return {"ok": True, "mode": request.app.state.session.mode, "version": mechsim.__version__}


@router.get("/scenes")
async def scenes():
    return {"scenes": list_scenes(), "user_scenes": list_user_scenes()}


@router.get("/scene")
async def current_scene(request: Request):
    session = request.app.state.session
    return {"name": session.scene_name, "source": session.scene_source, "scene": session.scene}


@router.post("/scene/load")
async def load_scene_route(body: LoadRequest, request: Request):
    session = request.app.state.session
    try:
        await session.load(body.name, body.source)
    except SceneNotFound:
        raise HTTPException(status_code=404, detail=f"unknown scene '{body.name}'")
    except SceneInvalid as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # the engine rejected a schema-valid scene
        raise HTTPException(status_code=422, detail=str(exc))
    return {"name": session.scene_name, "source": session.scene_source, "scene": session.scene}


@router.post("/scene/apply")
async def apply_scene(body: ApplyRequest, request: Request):
    """Make a scene from the editor the active simulation without saving it."""
    session = request.app.state.session
    name = body.name or body.scene.get("name") or "untitled"
    try:
        await session.load_scene_dict(body.scene, str(name), "draft")
    except Exception as exc:  # SceneInvalid, or the engine rejected the scene
        raise HTTPException(status_code=422, detail=str(exc))
    return {"name": session.scene_name, "source": session.scene_source, "scene": session.scene}


@router.post("/scene/save")
async def save_scene(body: SaveRequest):
    """Validate the scene and store it as a user scene (overwrites an existing one)."""
    try:
        name = save_user_scene(check_name(body.name), body.scene)
    except (SceneInvalid, SceneNameInvalid) as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"name": name, "source": "user"}


@router.delete("/scenes/user/{name}")
async def delete_scene(name: str):
    """Delete a saved scene (user scenes only; the examples are part of the program). The file goes to user_scenes/.trash/."""
    try:
        delete_user_scene(name)
    except SceneNameInvalid as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except SceneNotFound:
        raise HTTPException(status_code=404, detail=f"unknown scene '{name}'")
    return {"deleted": name}
