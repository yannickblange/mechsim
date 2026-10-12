"""The editor (frontend/js/editor/section.js), the engine (core/section.cpp) and the Python reference
(mechsim.analysis.sections, a sum of rectangles) compute the same sections."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from mechsim.analysis.sections import section_properties
from mechsim.sim import Simulation

REPO = Path(__file__).resolve().parents[2]


@pytest.mark.native
@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_area_and_inertia_agree_between_javascript_and_the_engine():
    out = subprocess.run(
        ["node", str(REPO / "tests/frontend/print_sections.mjs")], capture_output=True, text=True, check=True
    ).stdout
    cases = json.loads(out)
    assert len(cases) >= 10
    for case in cases:
        scene = {
            "version": "0.4",
            "bodies": [{"id": "b", "type": "beam", "position": [0, 0],
                        "params": {"length": 1.0, "section": case["section"]}}],
        }
        with Simulation(scene) as sim:
            beam = sim.frame()["bodies"][0]
        assert beam["A"] == pytest.approx(case["area"], rel=1e-12), case["section"]
        assert beam["I"] == pytest.approx(case["inertia"], rel=1e-12), case["section"]
        assert beam["EI"] == pytest.approx(210e9 * case["inertia"], rel=1e-12)
        reference = section_properties(case["section"])
        assert reference["area"] == pytest.approx(case["area"], rel=1e-12), case["section"]
        assert reference["inertia"] == pytest.approx(case["inertia"], rel=1e-9), case["section"]
