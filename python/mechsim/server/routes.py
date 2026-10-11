"""REST endpoints (contracts/protocol.md). TICKET B1 implements this file."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api")
