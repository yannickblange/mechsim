# A5: Pin support (Festlager)

**Agent:** A  **Depends on:** A3 merged  **Branch:** `v0.1/A5-pin-support`

## Files you own
- `native/engine/constraints/pin_support.cpp`
- `tests/native/constraints/test_pin_support.cpp`

## Read only
`constraints/pin_support.hpp`, `core/constraint.hpp`, `core/world.hpp`,
`docs/formulation.md` (Festlager section — implement exactly these formulas).

## Task
- `makePinSupport(spec, world)`: `id`, `body` (must exist, else throw
  `std::runtime_error("pin_support '<id>': unknown body '<body>'")`), `point` → `localPoint`.
  Convert nlohmann exceptions into `std::runtime_error` with the id.
- `initialize(world)`: `groundPoint = world.bodies[body].toWorld(localPoint)`; `reaction = {0,0}`.
- `fill(world, G, cols, gamma)`: `G` already points at this constraint's first row.
  With `B = world.bodies[body]`, `r = B.rotated(localPoint)`, `c = 3 * body`:
  ```
  G[0*cols + c + 0] = 1;   G[0*cols + c + 2] = -r.y;
  G[1*cols + c + 1] = 1;   G[1*cols + c + 2] =  r.x;
  C    = B.pos + r - groundPoint
  Cdot = B.vel + B.omega * perp(r)
  gamma = B.omega^2 * r - 2*alpha*Cdot - beta^2 * C     (alpha, beta from world.solver)
  ```
- `setMultipliers(lambda)`: `reaction = {lambda[0], lambda[1]}`.
- `writeFrame`: `"position": [groundPoint.x, groundPoint.y]`, `"reaction": [reaction.x, reaction.y]`.

## Tests (`tests/native/constraints/test_pin_support.cpp`)
Build `World` by hand with one or two bodies (use the second body's columns to check the offset).
1. `initialize` captures the world position of the local point (rotated body).
2. `fill` for body index 1 of 2, `phi = π/2`, local (0.5, 0): G entries in columns 3..5 match
   the formula, columns 0..2 untouched (still 0).
3. Body at rest at its initial pose → gamma = (0, 0).
4. Spinning body (ω = 2) at initial pose, alpha = beta = 0 → gamma = ω² r.
5. Body displaced by (+0.01, 0) at rest, alpha = 0, beta = 5 → gamma.x = -25 * 0.01.
6. `setMultipliers` then `writeFrame` → reaction values appear in JSON.
7. Unknown body id throws with the id in the message.

## Acceptance
```bash
./tools/build.sh && ctest --test-dir build -R pin --output-on-failure
```
