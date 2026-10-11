"""Repository paths used by the server and tests. Complete, do not change in v0.1.

Each path can be overridden with an environment variable (useful for tests).
"""
from __future__ import annotations

import os
from pathlib import Path

# python/mechsim/paths.py -> parents[2] is the repository root
REPO_ROOT = Path(os.environ.get("MECHSIM_ROOT", Path(__file__).resolve().parents[2]))

SCENES_DIR = Path(os.environ.get("MECHSIM_SCENES", REPO_ROOT / "scenes"))
FRONTEND_DIR = Path(os.environ.get("MECHSIM_FRONTEND", REPO_ROOT / "frontend"))
CONTRACTS_DIR = REPO_ROOT / "contracts"
SCENE_SCHEMA = CONTRACTS_DIR / "scene.schema.json"
STATE_SCHEMA = CONTRACTS_DIR / "state.schema.json"
LIB_DIR = Path(__file__).resolve().parent / "lib"
