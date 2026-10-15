"""REST endpoints (contracts/protocol.md)."""
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel

import mechsim
from mechsim.analysis.vibration import analyse
from mechsim.scene import (
    SceneInvalid,
    SceneNameInvalid,
    SceneNotFound,
    check_name,
    delete_user_scene,
    list_scenes,
    list_user_scenes,
    save_user_scene,
    validate_scene,
)

router = APIRouter(prefix="/api")


class LoadRequest(BaseModel):
    name: str
    source: str = "example"  # "example" | "user"


class ApplyRequest(BaseModel):
    scene: dict[str, Any]
    name: str | None = None


class AnalysisRequest(BaseModel):
    scene: dict[str, Any]
    t_max: float = 10.0
    samples: int = 1500
    response: bool = True


class SaveRequest(BaseModel):
    name: str
    scene: dict[str, Any]


@router.get("/health")
async def health(request: Request):
    # can_quit: the packaged app (mechsim.launcher) lets the page end the program; a server started by hand does not
    return {"ok": True, "mode": request.app.state.session.mode, "version": mechsim.__version__,
            "can_quit": getattr(request.app.state, "shutdown", None) is not None}


@router.post("/shutdown")
async def shutdown(request: Request):
    """Ends the program (only in the packaged app / launcher; 404 otherwise). The answer is sent first."""
    stop = getattr(request.app.state, "shutdown", None)
    if stop is None:
        raise HTTPException(status_code=404, detail="this server cannot be ended from the page")
    asyncio.get_running_loop().call_later(0.5, stop)
    return {"ok": True}


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


@router.post("/analysis")
async def analysis(body: AnalysisRequest):
    """The linear vibration analysis of a scene (Eigenwerte, Dämpfungsgrad, frequency response, ...) and the engine's run of it
    (`response`), for the analysis window. The scene is a copy that the window edits: the active simulation is not touched.
    A scene that cannot be linearised answers 200 with `supported: false` and the reason."""
    errors = validate_scene(body.scene)
    if errors:
        raise HTTPException(status_code=422, detail="; ".join(errors))
    t_max = min(600.0, max(0.1, body.t_max))
    samples = min(5000, max(10, body.samples))
    return await run_in_threadpool(lambda: analyse(body.scene, t_max=t_max, samples=samples, response=body.response))
