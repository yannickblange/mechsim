"""Runs the Node unit tests of the editor modules (tests/frontend/*.test.mjs) as part of pytest."""
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_editor_unit_tests_pass():
    result = subprocess.run(
        ["node", "--test", str(REPO / "tests/frontend")], capture_output=True, text=True, cwd=REPO
    )
    assert result.returncode == 0, result.stdout[-4000:] + result.stderr[-2000:]
