# A8: Physics validation tests

**Agent:** A  **Depends on:** A7 and B5 merged  **Branch:** `v0.1/A8-validation`

## Files you own
- `python/mechsim/analysis/energy.py`
- `tests/validation/test_harmonic_oscillator.py`
- `tests/validation/test_pendulum_small_angle.py`
- `tests/validation/test_energy_conservation.py`
- `tests/validation/test_pin_reaction_static.py`

## Read only
`python/mechsim/sim.py`, `tests/conftest.py` (fixtures `load_example`, `state_schema`),
`docs/formulation.md`, `scenes/*.json`.

## Task
### energy.py
- `total_energy(frame)` = kinetic + potential.
- `energy_drift(frames)` = `(max(E) − min(E)) / max(max kinetic over frames, 1e-12)`.
  (Normalised by peak kinetic energy because the potential zero level is arbitrary.)

### Tests (keep `pytestmark = pytest.mark.native`)
Use `mechsim.sim.Simulation` and the `load_example` fixture.
1. **Harmonic oscillator** (`single_mass_spring`): record y every step for 3 s. Equilibrium
   `y_eq = 1.0 − 0.1 − (0.5 + 9.81/100)`. Period from downward crossings of `y − y_eq` vs
   `2π/√(k/m)` within **0.5 %**. Peak amplitude in the last period within **1 %** of the first.
   x and phi stay at 0 within 1e-9.
2. **Pendulum** (`physical_pendulum`): 5 s, period vs `2π√(J_A/(m g d))` within **1 %**.
3. **Energy**: for every scene in `scenes/`, 5 s of frames sampled every 10 steps:
   `energy_drift < 0.02`. Every sampled frame validates against `state_schema` (jsonschema).
4. **Static reaction**: inline scene, one block m = 2 pinned at its centre (`point: [0, 0]`),
   no springs. After 100 steps: reaction ≈ `[0, 2·9.81]` (rel 1e-6), body has not moved (1e-9).

## Acceptance
```bash
./tools/build.sh && python3 -m pytest tests/validation -v
```
All validation tests pass, none skipped.
