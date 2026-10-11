# A3: World

**Agent:** A  **Depends on:** A2 merged  **Branch:** `v0.1/A3-world`

## Files you own
- `native/engine/core/world.cpp`
- `tests/native/test_world.cpp`

## Read only
`core/world.hpp`, `core/element.hpp`, `core/constraint.hpp`, `solver/integrators.hpp`,
`contracts/state.schema.json`, `contracts/units.md`.

## Task
Implement every method of `ms::World`:

- `findBody(id)`: index in `bodies` or `GROUND`.
- `anchorWorld(a)`: `a.body == GROUND ? a.point : bodies[a.body].toWorld(a.point)`.
- `anchorVelocity(a)`: `{0,0}` for ground, else `bodies[a.body].velocityAt(a.point)`.
- `constraintRows()`: sum of `dim()`.
- `initialize()`: `saveInitialState()` on every body, then `initialize(*this)` on every constraint.
- `step(dt)`: if `solver.integrator == "semi_implicit_euler"` call `stepSemiImplicitEuler(*this, dt)`
  (include `../solver/integrators.hpp`), else throw `std::runtime_error("unknown integrator '...'")`.
  The integrator advances `time`; do not add dt here.
- `reset()`: `restoreInitialState()` on every body, `time = 0`, `initialize(*this)` on every constraint.
- `kineticEnergy()`: sum over bodies.
- `potentialEnergy()`: `sum(-b.mass * dot(gravity, b.pos))` + `sum(e->potentialEnergy(*this))`.
- `frame()`: build exactly the structure of `contracts/state.schema.json`:
  ```json
  {"t": time,
   "bodies": [{"id","x","y","phi","vx","vy","omega"}, ...],
   "elements": [ {"id": e->id, "type": e->type()} + e->writeFrame(...) ],
   "constraints": [ {"id": c->id, "type": c->type()} + c->writeFrame(...) ],
   "energy": {"kinetic": ..., "potential": ...}}
  ```
  `elements` and `constraints` must be JSON arrays even when empty (`nlohmann::json::array()`).

`stepSemiImplicitEuler` is still a stub until A6; that is fine, `step()` will throw until then.

## Tests (`tests/native/test_world.cpp`)
Define small test doubles inside the test file (anonymous namespace):
- `FakeElement : Element` with a fixed `potentialEnergy` of 1.5 and an empty `writeFrame` that adds
  `"p1": [0,0], "p2": [0,0], "force": 0.0`.
- `FakeConstraint : Constraint` with configurable `dim()`, a counter of `initialize` calls, and
  `writeFrame` adding `"position": [0,0], "reaction": [0,0]`.

Required cases:
1. `findBody` finds by id, returns `GROUND` for unknown id.
2. `anchorWorld` for ground (returns point) and for a body rotated by π/2.
3. `anchorVelocity` for ground is zero; for a spinning body matches `Body::velocityAt`.
4. `constraintRows` with fake constraints of dim 2 and 3 → 5.
5. `initialize` then change body states and `time`, `reset` → states and `time == 0` restored,
   `initialize` called twice on the fake constraint.
6. `potentialEnergy`: one body m=2 at y=3, gravity (0,-9.81), plus FakeElement → 2*9.81*3 + 1.5.
7. `frame()` contains all required keys, arrays have the right sizes, `"type"` is set by World.
8. `step` with integrator `"rk99"` throws `std::runtime_error`.

## Acceptance
```bash
./tools/build.sh && ctest --test-dir build -R world --output-on-failure
```
