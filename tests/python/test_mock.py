"""TICKET B1.4. MockSimulation tests (see docs/tickets/v0.1/)."""
from __future__ import annotations

import jsonschema
import pytest

from mechsim.server.mock import MockSimulation

SCENE_NAMES = [
    "pinned_block_spring",
    "single_mass_spring",
    "two_mass_chain",
    "physical_pendulum",
    "cantilever_clamp",
    "disc_spring_moment",
    "impulse_pendulum",
    "incline_roller",
]


@pytest.mark.parametrize("scene_name", SCENE_NAMES)
def test_frame_validates_against_state_schema(
    load_example, state_schema, scene_name: str
) -> None:
    sim = MockSimulation(load_example(scene_name))
    sim.step(n=5)
    jsonschema.validate(sim.frame(), state_schema)


@pytest.mark.parametrize("scene_name", SCENE_NAMES)
def test_step_advances_time_by_n_times_dt(load_example, scene_name: str) -> None:
    sim = MockSimulation(load_example(scene_name))
    sim.step(n=10)
    assert sim.time == pytest.approx(10 * sim.dt)


@pytest.mark.parametrize("scene_name", SCENE_NAMES)
def test_reset_returns_time_to_zero(load_example, scene_name: str) -> None:
    sim = MockSimulation(load_example(scene_name))
    sim.step(n=5)
    sim.reset()
    assert sim.time == 0.0


@pytest.mark.parametrize("scene_name", SCENE_NAMES)
def test_close_is_idempotent(load_example, scene_name: str) -> None:
    sim = MockSimulation(load_example(scene_name))
    sim.close()
    sim.close()
