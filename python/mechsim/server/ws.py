"""WebSocket endpoint /ws (contracts/protocol.md). TICKET B1 implements this file."""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    session = websocket.app.state.session
    session.clients.add(websocket)
    try:
        await websocket.send_json(session.status())
        if session.sim is not None:
            await websocket.send_json({"type": "frame", "data": session.sim.frame()})
        while True:
            msg = await websocket.receive_json()
            await session.command(msg, websocket)
    except WebSocketDisconnect:
        pass
    finally:
        session.clients.discard(websocket)
