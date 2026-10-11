"""Tests for the ctypes binding and the Simulation wrapper (need the native library)."""
import jsonschema
import pytest

from mechsim import _native
from mechsim.protocol import SimulationLike
from mechsim.scene import list_scenes
from mechsim.sim import Simulation

pytestmark = pytest.mark.native


def test_library_loads_and_reports_version():
    assert _native.load().ms_version() == b"0.1.0"


def test_invalid_scene_raises_native_error():
    with pytest.raises(_native.NativeError) as err:
        Simulation("{")
    assert str(err.value)


def test_single_mass_spring_step_and_reset(load_example):
    with Simulation(load_example("single_mass_spring")) as sim:
        initial = sim.state()
        assert initial[0].tolist() == [0, 0, 0, 0, 0, 0]
        sim.step(n=10)
        assert sim.time == pytest.approx(0.01)
        assert sim.state()[0][1] != 0.0
        sim.reset()
        assert sim.time == 0.0
        assert sim.state().tolist() == initial.tolist()


def test_two_mass_chain_state_shape(load_example):
    with Simulation(load_example("two_mass_chain")) as sim:
        assert sim.state().shape == (2, 6)
        assert sim.body_count == 2


@pytest.mark.parametrize("name", list_scenes())
def test_frames_validate(load_example, state_schema, name):
    with Simulation(load_example(name)) as sim:
        jsonschema.validate(sim.frame(), state_schema)
        sim.step(n=5)
        jsonschema.validate(sim.frame(), state_schema)


def test_dt_comes_from_the_scene(load_example):
    scene = load_example("single_mass_spring")
    scene["solver"] = {"dt": 0.002}
    with Simulation(scene) as sim:
        assert sim.dt == 0.002
        sim.step(n=5)
        assert sim.time == pytest.approx(0.01)


def test_argument_and_lifecycle_errors(load_example):
    sim = Simulation(load_example("single_mass_spring"))
    with pytest.raises(ValueError):
        sim.step(n=0)
    sim.close()
    sim.close()
    for attr in ("time", "dt", "body_count"):
        with pytest.raises(RuntimeError):
            getattr(sim, attr)
    for call in (sim.step, sim.reset, sim.state, sim.frame):
        with pytest.raises(RuntimeError):
            call()


def test_is_simulation_like(load_example):
    with Simulation(load_example("single_mass_spring")) as sim:
        assert isinstance(sim, SimulationLike)
