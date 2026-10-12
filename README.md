# MechSim

Planar multibody mechanics simulator with three degrees of freedom per body (x, y, φ).
Components follow the Technische Mechanik vocabulary: Feder, Dämpfer, Masse, Balken, Festlager,
Loslager, Einspannung, Gelenk. v0.1 contains block masses, springs and the Festlager. v0.2 adds a layout
editor (draw, simulate, save your own layouts) with rectangular and circular masses, surfaces, springs
with a relaxed-length "ghost", constant and impulsive force/moment loads, Festlager, fixed Lager and Loslager.
v0.3 adds rope (tension only, infinitely strong), Stab (rod), hinge and rigid joints, a Festlager in free space, a
move tool and connection markers. v0.3c adds the damper (Dämpfer).

## Quick start

```bash
python3 -m pip install -e ".[dev]"
./tools/build.sh          # needs CMake >= 3.20 and a C/C++ compiler (Apple clang is fine)
./tools/run_server.sh     # open http://127.0.0.1:8000
```

Without a working native build, `./tools/run_server.sh --mock` serves the UI with fake motion.

## Editor (v0.2)

Click **Edit** (or **New**), then the floating **+** at the bottom left: its icons slide out.

| Tool | How |
|------|-----|
| Rectangular mass | drag from corner to corner (starting on a sloped surface aligns it with the surface) |
| Circular mass | click the centre, then click / drag for the radius |
| Surface | drag; the angle snaps to 0, 30, 45, 60, 90 degrees (Shift = free) |
| Spring | click end A, click end B, then move the dashed **ghost** to the relaxed length and click (Enter = unloaded) |
| Force / moment | press on a mass (centre, corner, edge snap) and drag for the force; a plain click adds a moment |
| Festlager, fixed Lager, Loslager | two clicks: a point of a mass, then the surface it sits on. The symbol adapts to the surface angle and grows to span the distance between them. The Loslager needs a surface. A Festlager can also be placed in free space with one click |
| Damper | click end A, click end B (a mass, a Festlager in free space, or the ground); set the damping c in its properties |
| Rope, Stab | click end A, click end B (a mass, a Festlager in free space, or the ground). The rope never stretches but can go slack (set a longer length in its properties); the Stab takes push and pull |
| Joint, rigid joint | click where two masses touch or overlap: a hinge (Gelenk) or a rigid connection. On a free-space Festlager it pins the mass that lies on it |
| Move | drag a mass (with what is attached and the masses joined to it), a surface or a free-space Festlager; drag a support or load to re-place it, or the end of a spring / rope / Stab to attach it elsewhere. Shift: no grid snap |

Right-click any object for its properties (mass, size, initial velocity, spring stiffness / relaxed length,
constant or impulse load) and **Delete**; Ctrl/Cmd+Z undoes. **Save** stores the layout in `user_scenes/`
(it then appears under *My layouts*); **Done** / **Play** send it to the engine. Dotted rings mark where things
are joined; selecting an object outlines what it is connected to.

## Layout

| Path | Language | Role |
|------|----------|------|
| `contracts/` | JSON/MD | Scene format, frame format, protocol, units: the agreements between layers |
| `native/linalg/` | C99 | Dense linear algebra kernels |
| `native/engine/` | C++17 | Bodies, force elements, constraints, solver, scene loader |
| `native/include/mechsim.h` | C | Public API used by Python through ctypes |
| `python/mechsim/` | Python | Binding, server (FastAPI + WebSocket), analysis |
| `frontend/` | HTML/JS | Canvas UI |
| `scenes/` | JSON | Example scenes |
| `user_scenes/` | JSON | Layouts saved from the editor (created on first save) |
| `tests/` | C/C++/Python | Unit, server and physics validation tests |
| `docs/` | MD | Architecture, equations, tickets |

## Tests

```bash
./tools/run_tests.sh      # ctest + pytest (pytest also runs the Node unit tests of the editor)
node --test tests/frontend   # editor unit tests only (needs Node >= 20)
```
