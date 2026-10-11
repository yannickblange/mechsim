# A2: Body and Block

**Agent:** A  **Depends on:** nothing (A1 not needed)  **Branch:** `v0.1/A2-body-block`

## Files you own
- `native/engine/core/body.cpp`
- `native/engine/bodies/block.cpp`
- `tests/native/test_body.cpp`
- `tests/native/test_block.cpp`

## Read only
`core/types.hpp`, `core/body.hpp`, `bodies/block.hpp`, `contracts/units.md`, `docs/formulation.md`.

## Task
### body.cpp: implement every method of `ms::Body`
- `rotated(local)` = `rotate(local, phi)`
- `toWorld(local)` = `pos + rotated(local)`
- `velocityAt(local)` = `vel + cross(omega, rotated(local))`
- `applyForceAt(f, local)`: `force += f; torque += cross(rotated(local), f);`
- `applyForce(f)`: `force += f`
- `clearForces()`: zero `force` and `torque`
- `kineticEnergy()`: `0.5 * mass * dot(vel, vel) + 0.5 * inertia * omega * omega`
- `saveInitialState()` / `restoreInitialState()`: copy pos, phi, vel, omega to/from the private
  `*0_` members. `restoreInitialState` also calls `clearForces()`.

### block.cpp
- `blockInertia(m, w, h)` = `m * (w*w + h*h) / 12.0`
- `initBlock(body, params)`:
  read `mass`, `width`, `height` from `params` (an object). If any is missing, not a number, or
  `<= 0`, throw `std::runtime_error("block: '<field>' must be a number > 0")`.
  Set `body.type = "block"`, `body.mass`, `body.inertia = blockInertia(...)`.
  Do not touch pos/phi/vel/omega.

## Tests (Catch2, use `Catch::Matchers::WithinAbs(x, 1e-12)`)
`test_body.cpp`:
1. `rotated({1,0})` with `phi = π/2` ≈ `{0,1}`.
2. `toWorld` with `pos={1,2}`, `phi=π/2`, `local={1,0}` ≈ `{1,3}`.
3. `velocityAt`: `vel={1,0}`, `omega=2`, `phi=0`, `local={1,0}` → `{1,2}`.
4. `applyForceAt({0,1}, {1,0})` at `phi=0` → `force={0,1}`, `torque=+1` (CCW).
5. Same force at `phi=π` → `torque=-1`.
6. `clearForces` resets both.
7. `kineticEnergy`: m=2, J=3, vel={1,1}, ω=2 → 2 + 6 = 8.
8. save → modify state → restore → original values, forces zero.

`test_block.cpp`:
1. `blockInertia(12, 1, 1) == 2`.
2. `initBlock` with `{"mass":3,"width":0.4,"height":0.3}` → mass 3, inertia 0.0625, type "block".
3. Missing `height` throws; `mass: 0` throws; `width: "a"` throws (`REQUIRE_THROWS_AS(..., std::runtime_error)`).

## Acceptance
```bash
./tools/build.sh && ctest --test-dir build -R "body|block" --output-on-failure
```
All body/block tests pass, none skipped.
