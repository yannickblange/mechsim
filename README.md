# MechSim

Planar multibody mechanics simulator with three degrees of freedom per body (x, y, φ).
Components follow the Technische Mechanik vocabulary: Feder, Dämpfer, Masse, Balken, Festlager,
Loslager, Einspannung, Gelenk. v0.1 contains block masses, springs and the Festlager.

## Quick start

```bash
python3 -m pip install -e ".[dev]"
./tools/build.sh          # needs CMake >= 3.20 and a C/C++ compiler (Apple clang is fine)
./tools/run_server.sh     # open http://127.0.0.1:8000
```

Without a working native build, `./tools/run_server.sh --mock` serves the UI with fake motion.

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
| `tests/` | C/C++/Python | Unit, server and physics validation tests |
| `docs/` | MD | Architecture, equations, tickets |

## Tests

```bash
./tools/run_tests.sh      # ctest + pytest
```
