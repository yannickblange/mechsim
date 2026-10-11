"""REST endpoints (contracts/protocol.md). TICKET B1 implements this file."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

import mechsim
from mechsim.scene import SceneInvalid, SceneNotFound, list_scenes

router = APIRouter(prefix="/api")


class LoadRequest(BaseModel):
    name: str


@router.get("/health")
async def health(request: Request):
    return {"ok": True, "mode": request.app.state.session.mode, "version": mechsim.__version__}


@router.get("/scenes")
async def scenes():
    return {"scenes": list_scenes()}


@router.get("/scene")
async def current_scene(request: Request):
    session = request.app.state.session
    return {"name": session.scene_name, "scene": session.scene}


@router.post("/scene/load")
async def load_scene_route(body: LoadRequest, request: Request):
    session = request.app.state.session
    try:
        await session.load(body.name)
    except SceneNotFound:
        raise HTTPException(status_code=404, detail=f"unknown scene '{body.name}'")
    except SceneInvalid as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # the engine rejected a schema-valid scene
        raise HTTPException(status_code=422, detail=str(exc))
    return {"name": session.scene_name, "scene": session.scene}
