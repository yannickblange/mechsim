# MechSim

Planar multibody mechanics simulator with three degrees of freedom per body (x, y, φ).
Components follow the Technische Mechanik vocabulary: Feder, Dämpfer, Masse, Balken, Festlager,
Loslager, Einspannung, Gelenk. v0.1 contains block masses, springs and the Festlager. v0.2 adds a layout
editor (draw, simulate, save your own layouts) with rectangular and circular masses, surfaces, springs
with a relaxed-length "ghost", constant and impulsive force/moment loads, Festlager, fixed Lager and Loslager.
v0.3 adds rope (tension only, infinitely strong), Stab (rod), hinge and rigid joints, a Festlager in free space, a
move tool and connection markers. v0.3c adds the damper (Dämpfer). v0.4 adds displacement graphs, a light and a dark
colour scheme, nodes (Knoten) and elastic bars for Fachwerke, bendable steel beams with square, L, T, H and I
sections, harmonic loads and example scenes for free, harmonic and forced vibrations. v0.4b lets elastic Stabs bend and
buckle (Euler) and adds viscous damping so that loaded beams settle.

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
| Rope | click end A, click end B (a mass, a Festlager in free space, or the ground). The rope never stretches but can go slack (set a longer length in its properties) |
| Stab | click end A, click end B: a mass, a node, a Festlager in free space - or free space itself, which makes a **node** (Knoten) there, so Stabs can be joined into a **Fachwerk**. A Stab is never pinned to empty space: a fixed point is a Festlager. It takes push and pull; give it a cross section in its properties to make it an elastic bar (axial stiffness E A / L) |
| Node | click to place a Knoten (a point mass where Stabs meet); supports and forces can sit on it like on any mass |
| Beam | drag along the axis: a bendable steel beam (Euler-Bernoulli). Right-click it for length, cross section (square, L, T, H, I and their dimensions), mass, start values. The toolbar's *Bending* selector shows the bending 10, 50 or 200 times as large |
| Joint, rigid joint | click where two masses touch or overlap: a hinge (Gelenk) or a rigid connection. On a free-space Festlager it pins the mass that lies on it |
| Move | drag a mass (with what is attached and the masses joined to it), a surface or a free-space Festlager; drag a support or load to re-place it, or the end of a spring / rope / Stab to attach it elsewhere. Shift: no grid snap |

Right-click any object for its properties (mass, size, initial velocity, spring stiffness / relaxed length,
constant, impulse or harmonic load, cross sections) and **Delete**; Ctrl/Cmd+Z undoes. **Save** stores the layout in `user_scenes/`
(it then appears under *My layouts*); **Done** / **Play** send it to the engine. Dotted rings mark where things
are joined; selecting an object outlines what it is connected to.

## Graphs and colour schemes (v0.4)

Right-click a **mass** (while the simulation is shown) or choose **Graph** in its properties (in the editor): a floating panel
plots its displacement from the starting position against time (x and y, the magnitude, or the rotation), with a hover
read-out, a time window and a CSV export. The data are the poses after *every* engine step (the server sends them with each
frame), so fast vibrations are not aliased by the 60 Hz display. The panels can be dragged and resized.

The default colour scheme is a white board with black lines, a grey grid and blue forces; the round **moon button** in the bottom-right corner
switches to a dark one (remembered in the browser).

## German UI and dimensioned cross sections (v0.6)

Everything visible in the browser is German (buttons, hints, property forms, graphs, scene names; decimal comma, typed numbers accept comma or dot).
Technical ids such as `m1` or `s1` and the scene files' descriptions stay as they are, and so do the messages of the server (it rejects a bad scene in English).
The German names of the example scenes are in `frontend/js/scene-names.js`, the number format in `frontend/js/format.js`.

The cross-section form of beams and elastic Stabs shows the section as a **dimensioned drawing** (outline, extension lines, arrows, neutral axis z, centroid):
every dimension (b, h, tf, tw, t, a, in mm) is typed into a field that sits on its own dimension line.

## Playing a simulation (v0.5)

Play / pause, step and reset are icon buttons (Space plays and pauses). The **time bar** shows `t / t_max`: drag it to jump to a time (the run pauses
while you hold it; going back resets and runs forward again, the graphs keep their history), and type the end time `t_max` (0.1 to 600 s, 10 s at start)
in the box next to it. The run stops exactly at `t_max`; Play at the end starts again from t = 0. A scene can suggest its own end time with the optional
top-level `"t_max"`.

## Fachwerke and beams (v0.4)

- *Fachwerk*: draw Stabs with the Stab tool (free ends become nodes, existing nodes are reused), put a Festlager and a Loslager
  on nodes, a force on a node. While the simulation runs every Stab shows its force, tension blue and compression red.
  Rigid Stabs give the forces of statically determinate trusses (method of joints); with cross sections the Stabs are elastic steel bars
  and indeterminate trusses work too. An elastic Stab is a beam-column: it sags under its own weight and **buckles** when its compression reaches the
  Euler load π² E I / L² (shown on its label as a percentage; the right-click popup tells the load and the slenderness; the initial bow, the number of
  elements and the damping are adjustable). Example scenes `truss_bridge`, `truss_elastic`, `buckling_columns`.
- *Beams*: Euler-Bernoulli with large rotations, one material (steel: E = 210 GPa, 7850 kg/m³), sections square, L, T, H, I.
  Supports, springs, loads and joints attach anywhere along the beam. A load that is applied suddenly makes an elastic beam swing about its static
  deflection; the **damping α** (1/s, in the properties of beams, elastic Stabs and nodes; 5 for new beams and bars) lets it settle. Example scenes
  `cantilever_beam` (undamped: it swings), `beam_i_section` (damped: it settles).
- *Vibrations*: example scenes `harmonic_oscillation`, `free_vibration`, `forced_vibration` (a harmonic load F sin(2π f t + φ)), and (v0.5) `resonance`:
  the same oscillator excited at its natural frequency (η = 1) with a damping ratio ζ = 0.02. The magnification factor V = 1/(2ζ) = 25 lets the
  swing grow period by period, x_max(t) = V F₀/k (1 − e^(−ζ ω₀ t)), to 1.27 m, 25 times the static deflection (undamped it would grow without bound).

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
