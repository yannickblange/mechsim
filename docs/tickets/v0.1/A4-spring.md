# A4: Spring (Feder)

**Agent:** A  **Depends on:** A3 merged  **Branch:** `v0.1/A4-spring`

## Files you own
- `native/engine/elements/spring.cpp`
- `tests/native/elements/test_spring.cpp`

## Read only
`elements/spring.hpp`, `core/world.hpp`, `contracts/scene.schema.json` (element + springParams),
`contracts/units.md`, `docs/formulation.md` (Forces section).

## Task
Implement `Spring` and `makeSpring` exactly as described in the header and `docs/formulation.md`.

- `currentLength`: `length(world.anchorWorld(b) - world.anchorWorld(a))`.
- `axialForce`: `k * (L - restLength)`, positive = tension.
- `applyForces`: `d = pb - pa`, `L = |d|`. If `L < 1e-12` return (no direction). `u = d / L`,
  `F = axialForce`. If `a.body != GROUND`: `bodies[a.body].applyForceAt(F * u, a.point)`.
  If `b.body != GROUND`: `bodies[b.body].applyForceAt(-F * u, b.point)`.
- `potentialEnergy`: `0.5 * k * (L - L0)^2`.
- `writeFrame`: add `"p1": [pa.x, pa.y]`, `"p2": [pb.x, pb.y]`, `"force": axialForce`.
- `makeSpring(spec, world)`:
  - `id = spec["id"]`
  - parse anchor a and b: `"body"` null → `GROUND`; a string → `world.findBody`; if not found
    throw `std::runtime_error("spring '<id>': unknown body '<body>'")`. `"point"` → Vec2.
  - `k = params["k"]`, must be a number `>= 0`, else throw with the spring id in the message.
  - `rest_length`: if present must be `>= 0`; if absent use the current distance between the
    anchors (the world bodies are at their initial pose when the loader calls this).
  - Convert nlohmann exceptions (missing keys) to `std::runtime_error` with the spring id.

## Tests (`tests/native/elements/test_spring.cpp`)
Build a `World` by hand (push `Body` objects, set mass/inertia directly). Required cases:
1. Ground (0,1) to body at (0,0), local point (0,0), k=100, L0=0.5 → body force = (0, +50), torque 0.
2. Compressed spring (L < L0) pushes the body away (sign check).
3. Off-centre attachment: body at origin, local point (0.1, 0), ground anchor at (0.1, 1) → torque
   equals `cross((0.1,0), F)`.
4. Body-to-body: forces on the two bodies are equal and opposite.
5. `potentialEnergy` matches ½k(L−L0)².
6. `makeSpring` without `rest_length` → `restLength` equals the initial distance and force is 0.
7. `makeSpring` with unknown body id throws, message contains the spring id.
8. Zero-length spring does not produce NaN.
9. `writeFrame` adds `p1`, `p2`, `force` with correct values.

## Acceptance
```bash
./tools/build.sh && ctest --test-dir build -R spring --output-on-failure
```
