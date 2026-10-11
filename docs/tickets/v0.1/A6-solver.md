# A6: Solver: assembler, Lagrange multipliers, semi-implicit Euler

**Agent:** A  **Depends on:** A1, A2, A3 merged (A4, A5 merged for the pendulum test)
**Branch:** `v0.1/A6-solver`

## Files you own
- `native/engine/solver/assembler.cpp`
- `native/engine/solver/lagrange.cpp`
- `native/engine/solver/integrators.cpp`
- `tests/native/test_solver.cpp`
- `tests/native/test_integrators.cpp`

## Read only
`solver/*.hpp`, `core/*.hpp`, `native/linalg/linalg.h`, `docs/formulation.md`.

## Task
### assemble(world, t, sys)
1. `n = 3 * bodies.size()`, `m = world.constraintRows()`; resize all vectors.
2. `clearForces()` on all bodies; `applyForce(mass * gravity)` on each; `e->applyForces(world, t)`.
3. For body i: `mass[3i..3i+2] = {m, m, J}`, `f[3i..3i+2] = {force.x, force.y, torque}`.
4. Fill `G` (m×n) and `gamma` with zeros, then for each constraint in order:
   `c->fill(world, &G[row * n], n, &gamma[row]); row += c->dim();`

### solveAccelerations(sys, acc, lambda)
- `m == 0`: `acc[i] = f[i] / mass[i]`, `lambda` empty, return 0.
- Otherwise Schur complement:
  `A = G M⁻¹ Gᵀ` (m×m, compute directly: `A[r][s] = Σ_k G[r][k] G[s][k] / mass[k]`),
  `rhs = gamma − G M⁻¹ f`, `la_solve(A, m, rhs)` → `lambda = rhs`,
  `acc = M⁻¹ (f + Gᵀ λ)` (use `la_matvec_t`).
- If `la_solve` does not return `LA_OK`, return -1.
- Use `std::vector<double>` buffers; no allocation inside linalg.

### stepSemiImplicitEuler(world, dt)
1. `assemble(world, world.time, sys)`; `solveAccelerations`. On failure throw
   `std::runtime_error("constraint system is singular at t = <time>")`.
2. Pass multipliers: walk constraints with a row offset, `c->setMultipliers(&lambda[row])`.
3. For each body: `vel += dt * a_xy; omega += dt * a_phi; pos += dt * vel; phi += dt * omega;`
   (velocity first, then position with the NEW velocity).
4. `world.time += dt`.

A static `System` (thread_local or member-free function-local) is fine to avoid reallocations.

## Tests
`test_solver.cpp`:
1. One free body: acceleration = gravity, angular acceleration 0.
2. One body with a FakeConstraint written in the test (or use `PinSupport` if A5 is merged)
   pinned at its centre: acceleration 0, λ = (0, m·9.81) within 1e-9.
3. Body pinned off-centre at rest under gravity: check `G a = gamma` holds to 1e-10.

`test_integrators.cpp`:
1. Free fall, dt = 0.001, 1000 steps from rest at y = 0: `y == -9.81 * dt² * n(n+1)/2` within 1e-9
   (exact formula for this scheme), `time == 1.0` within 1e-12.
2. Physical pendulum (scene `physical_pendulum.json` built by hand: block m=2, w=0.05, h=1,
   pin at local (0, 0.5), initial angle 0.1): simulate 5 s, measure the period from downward zero
   crossings of phi, compare with `2π √(J_A / (m g d))`, J_A = J + m d², d = 0.5 → within 1 %.
   Constraint drift `|pos + R(phi) p − p0| < 1e-4` at the end.

## Acceptance
```bash
./tools/build.sh && ctest --test-dir build --output-on-failure
```
All native tests pass except A7 placeholders (still skipped).
