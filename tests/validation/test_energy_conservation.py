"""Total energy stays bounded for every example scene; frames match the state schema."""
from pathlib import Path

import jsonschema
import pytest

from mechsim.analysis.energy import energy_drift
from mechsim.sim import Simulation

pytestmark = pytest.mark.native

ALL_SCENES = sorted(p.stem for p in (Path(__file__).resolve().parents[2] / "scenes").glob("*.json"))

# A rope that snaps taut is an inelastic collision and a damper dissipates: energy is lost by design
# (tests/validation/test_v03_physics.py and test_v03c_damper.py check what happens instead); a
# harmonic force does work on the system (tests/validation/test_v04_physics.py checks the response); beams,
# bars and nodes with a damping rate lose energy by design (they settle).
DISSIPATIVE = {"rope_catch", "spring_damper", "free_vibration", "forced_vibration", "resonance", "beam_i_section", "buckling_columns"}
# The drift is measured against the peak kinetic energy, which is (almost) zero for a structure at rest
# and micro-joules for a stiff steel truss: tests/validation/test_v04_physics.py checks their energy
# on the scale of the energy that moves.
STRUCTURES = {"truss_bridge", "truss_elastic"}
SCENE_NAMES = [n for n in ALL_SCENES if n not in DISSIPATIVE | STRUCTURES]

# Semi-implicit Euler is first order: the energy error oscillates with a relative amplitude of
# about omega*dt/2 (docs/formulation.md). The stiffest scene, pinned_block_spring (omega of about
# 20 rad/s), reaches 2.2 % at dt = 1 ms, so the bound is 3 %. test_drift_scales_with_dt below
# shows the error really comes from the scheme.
MAX_DRIFT = 0.03


def run(scene, steps_per_sample, samples=500):
    frames = []
    with Simulation(scene) as sim:
        frames.append(sim.frame())
        for _ in range(samples):
            sim.step(n=steps_per_sample)
            frames.append(sim.frame())
    return frames


@pytest.mark.parametrize("name", SCENE_NAMES)
def test_energy_drift_is_small(load_example, state_schema, name):
    frames = run(load_example(name), steps_per_sample=10)  # 5 s at dt = 1 ms
    for frame in frames:
        jsonschema.validate(frame, state_schema)
    assert energy_drift(frames) < MAX_DRIFT


def test_drift_scales_with_dt(load_example):
    scene = load_example("pinned_block_spring")
    coarse = energy_drift(run(scene, steps_per_sample=10))
    scene["solver"] = {"dt": 0.0005}
    fine = energy_drift(run(scene, steps_per_sample=20))  # same 5 s of simulated time
    assert fine == pytest.approx(coarse / 2, rel=0.15)
