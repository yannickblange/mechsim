"""Shared pytest fixtures. Complete, do not change in v0.1 (integration ticket only)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SCENES_DIR = REPO_ROOT / "scenes"
CONTRACTS_DIR = REPO_ROOT / "contracts"


def _native_available() -> tuple[bool, str]:
    try:
        from mechsim import _native

        _native.load()
        return True, ""
    except NotImplementedError:
        return False, "mechsim._native not implemented yet (ticket B5)"
    except Exception as exc:  # NativeLibraryNotFound, OSError, ...
        return False, f"native library not available: {exc}"


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    ok, reason = _native_available()
    if ok:
        return
    skip = pytest.mark.skip(reason=reason)
    for item in items:
        if "native" in item.keywords:
            item.add_marker(skip)


@pytest.fixture
def load_example():
    """load_example("single_mass_spring") -> scene dict from scenes/."""

    def _load(name: str) -> dict[str, Any]:
        return json.loads((SCENES_DIR / f"{name}.json").read_text())

    return _load


@pytest.fixture(scope="session")
def scene_schema() -> dict[str, Any]:
    return json.loads((CONTRACTS_DIR / "scene.schema.json").read_text())


@pytest.fixture(scope="session")
def state_schema() -> dict[str, Any]:
    return json.loads((CONTRACTS_DIR / "state.schema.json").read_text())
