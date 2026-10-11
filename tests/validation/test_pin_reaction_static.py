"""A block pinned at its centre of mass: the support carries the full weight."""
import pytest

from mechsim.sim import Simulation

pytestmark = pytest.mark.native

SCENE = {
    "version": "0.1",
    "bodies": [
        {
            "id": "b",
            "type": "block",
            "position": [0, 0],
            "params": {"mass": 2.0, "width": 0.2, "height": 0.2},
        }
    ],
    "elements": [],
    "constraints": [{"id": "A", "type": "pin_support", "body": "b", "point": [0, 0]}],
}


def test_static_reaction():
    with Simulation(SCENE) as sim:
        sim.step(n=100)
        frame = sim.frame()
    assert frame["constraints"][0]["reaction"] == pytest.approx([0.0, 2 * 9.81], rel=1e-6, abs=1e-9)
    body = frame["bodies"][0]
    assert abs(body["x"]) < 1e-9
    assert abs(body["y"]) < 1e-9
