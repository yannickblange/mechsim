# v0.8 notes: collisions with surfaces, friction, curved surfaces

Branch `v0.8/contact-surfaces` (from `v0.7b/stab-on-mass`), not merged.

## What was asked

Collision physics between the mass objects and the surfaces; a friction value for surfaces (default 0); curved surfaces: a spline tool, preset half circles or the
regular straight surface, offered in a menu that appears once in the surface tool.

Decisions taken with the user: **blocks and discs** collide (Knoten, Staebe, springs and beams pass through, as before); surfaces get a **restitution** (bounce) next to the friction, default 0.

## What was added

| Layer | Content |
|-------|---------|
| Engine | `solver/contact.cpp`: contacts of blocks and discs with the polylines of the surfaces (corner on segment, vertex on edge, disc on segment, disc on vertex); unilateral non-penetration at velocity level with look-ahead, Newton restitution on impacts, Coulomb friction (stick / slide), active-set iteration inside the Schur complement solve (matrix of the forces `H` differs from `G` for sliding contacts); `World::surfaces`, `Body::Shape`; `integrators.cpp` uses it only when a mass is near a surface (otherwise the step is the one of v0.7, bit for bit); the loader reads `friction`, `restitution`, `points`; pairs of a mass and a surface that a support connects do not collide |
| Contracts | scene: surface `friction`, `restitution`, `points`, `shape`, `control`; frame: `contacts` (`state.schema.json`); `formulation.md` (contact section), `units.md` |
| Editor | the surface tool has a **menu** (Gerade, Spline, Halbkreis ∪, Halbkreis ∩; `Tool.menu` / `setMenu`, `Editor.buildMenu`); `editor/surfaces.js` (centripetal Catmull-Rom sampling with at most 1 degree per vertex, half circles, flip, translate); `geometry.js`: `surfacePath`, `closestOnSurface`, `nearestSegment`, support angles on the local segment of a curve; hit test, snapping, moves, support symbols and the camera fit know curves; the surface form (right-click): friction μ, bounce e, **Seiten tauschen** |
| Drawing | `symbols/surface.js` hatches along the curve (a surface with friction is hatched more densely); `symbols/contact.js` draws the normal force (solid) and the friction force (dashed) with their values |
| Examples | `incline_friction`, `bouncing_ball`, `half_circle_bowl`, `friction_oscillator` |
| Tests | `tests/native/test_contact.cpp`, `tests/validation/test_v08_physics.py`, `tests/frontend/v08.test.mjs` |

## Decisions worth knowing

- **Velocity-level contact inside the acceleration-level solver.** The engine solves `M a = f + H^T lambda` with Baumgarte-stabilised constraints; contacts need impacts. The condition for the
  *new* velocity `g + dt J_n v+ >= 0` is a condition on `a`, so contacts are just more (unilateral) rows with an offset, solved by the same Schur complement; no separate collision phase.
- **One contact per disc (or per block corner) and surface.** Where two polyline segments meet, a disc lies over both; with friction both stick and wedge it (a disc rolling in a bowl got stuck at
  a vertex). Only the nearest feature is kept.
- **Friction states before normal forces.** Two sticking corners of a block are redundant and their normal forces are meaningless: the first version released a corner instead of letting the block
  slide and cycled (a spring pulling a block over a rough floor did not move at all).
- **A vertex near the end of a block's edge is the block's corner**, not a hit on its side (a block that sank 10 micrometres into a line lost most of its speed at the end of a table).
- **A mass that a support attaches to a surface does not collide with it.** Existing scenes (a pendulum hung from a ceiling) keep working, and the support is the connection there. A Festlager on a
  floor edge, say, therefore lets a block tip through the floor.
- **Polylines are polygons**: every vertex turns the velocity by its angle and takes `1/2 m (v dtheta)^2`. The editor samples curves at 1 degree or less; scenes written by hand should too.
- **Surfaces are one-sided**: a mass on the hatched side is inside the solid; deeper than half its smallest dimension it is ignored, otherwise it is pushed out slowly (at most 0.5 m/s).
- **Not done**: collisions between masses; control points of a spline cannot be dragged after the curve is made (draw it again, or move it as a whole); the mock engine (`--mock`) has no contacts.

## Tests

```
100% tests passed out of 143   (ctest)
409 passed                     (pytest)
265 pass, 0 fail               (node --test tests/frontend)
```

## Packaging: a program to double-click (v0.8-3)

`python tools/package.py` -> `dist/MechSim-<version>-<system>-<machine>.zip` (see the README). Parts:

| File | Content |
|------|---------|
| `python/mechsim/launcher.py` | the starter (also `python -m mechsim.launcher`, `mechsim` script): saved layouts to `Documents/MechSim/Aufbauten`; one instance (a second start only opens the browser); port 8000 or the next free; opens the browser when the server answers; ends when no browser tab has been connected for 45 s; without a console the log goes to `Documents/MechSim/mechsim.log` and a start problem to a dialog; the same transport on every system (asyncio, h11, websockets: no uvloop / httptools) |
| `paths.py`, `server/app.py` | frozen-aware root (`sys._MEIPASS`); the `/tests` mount only if the folder exists |
| `routes.py`, `index.html`, `main.js` | `POST /api/shutdown` and the **Beenden** button (only if `health.can_quit`: the launcher sets `app.state.shutdown`) |
| `tools/mechsim.spec`, `tools/app_entry.py` | the PyInstaller recipe (a folder, no one-file: no unpacking at every start). Windows: with a console window; macOS: `MechSim.app`, `LSUIElement` (no Dock icon) |
| `tools/package.py` | builds the native library (Windows: runtime linked in, no Visual C++ redistributable needed; macOS 11 or newer), PyInstaller, the zip (`ditto` on macOS), and **tests the unzipped program** |
| `tools/dist/LIESMICH.txt` | the instructions that go into the zip (German) |
| `.github/workflows/package.yml` | builds Windows, macOS (arm64, Intel) and Linux on GitHub |
| `tests/python/test_launcher.py` | user folder, ports, one instance, idle end, shutdown from the page, a real launched process |

Decisions worth knowing:

- **PyInstaller cannot build for another system.** The macOS zip was built and tested on a Mac (arm64); the Windows `.exe` has to be built on Windows or by the workflow. It is **untested on Windows**:
  the native sources compile pedantically clean with clang (`-std=c++17 -pedantic`, no VLAs, no POSIX headers) and the C API already has `__declspec(dllexport)`, but MSVC has not seen this version.
- **The macOS app has no Dock icon.** A first version had one, and the Dock's Quit (an Apple event) was never answered: the packaged program has no event loop of its own for it (an `osascript` quit hung for minutes).
  Now the page has a Beenden button and the program ends when the tab is closed.
- **Unsigned.** The macOS app is signed ad hoc (valid, but Gatekeeper says "rejected" for an app from the internet): the first start needs right click -> Open. A Developer ID certificate and notarisation
  would remove that; so would a code signing certificate for Windows SmartScreen. Both cost money and are not part of this.
- The macOS zip is for the architecture it was built on; an Intel Mac needs its own build (the workflow has one).
