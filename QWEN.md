# Rules for coding agents (read before every ticket)

You are one of two agents working in the same git repository at the same time. Merge conflicts
are the main risk, so file ownership is strict.

## The five rules

1. **Only edit the files listed under "Files you own" in your ticket.** You may create new files
   only where the ticket says so. Everything else is read-only for you.
2. **Never edit frozen files**, even if you think they are wrong:
   `contracts/*`, `native/include/mechsim.h`, `native/linalg/linalg.h`, every `*.hpp` in
   `native/engine/`, `native/engine/core/registry.cpp`, all `CMakeLists.txt`, `pyproject.toml`,
   `tests/conftest.py`, `python/mechsim/paths.py`, `python/mechsim/protocol.py`,
   `frontend/index.html`, `frontend/js/main.js`, `frontend/js/canvas/symbols/index.js`, `QWEN.md`.
   If a frozen file blocks you, stop and write the problem into your final message.
   Do not work around it by changing the interface.
3. **Private helpers stay private.** C++: anonymous namespace in the `.cpp`. JS/Python: unexported
   functions in your own file. Do not add declarations to frozen headers.
4. **One ticket = one branch = one commit series.** Branch name is given in the ticket.
   Commit messages start with the ticket id: `[A3] implement World::frame`.
   Do not merge into `main` yourself; the human merges.
5. **Done means tests pass.** Run the commands in the ticket's "Acceptance" section and paste
   the summary lines into your final message. Do not mark tests as skipped to make them pass.

## Build and test commands

```bash
./tools/build.sh                      # configure + build native code, copies lib into python/
ctest --test-dir build --output-on-failure
python3 -m pytest -q                  # Python + validation tests
./tools/run_server.sh --mock          # web UI without native engine, http://127.0.0.1:8000
./tools/run_server.sh                 # web UI with native engine
```

Setup once: `python3 -m pip install -e ".[dev]"` and CMake >= 3.20.

## Conventions

- Units and signs: `contracts/units.md`. SI only, y up, angles in rad CCW.
- C: C99, no allocation in linalg. C++: C++17, no raw `new`/`delete`, throw
  `std::runtime_error` with a message that names the offending object id.
- No C++ exception may escape the C API (`mechsim_capi.cpp`).
- Python: 3.10+, type hints, no new dependencies beyond `pyproject.toml`.
- JS: plain ES modules, no frameworks, no build step, no external CDNs.
- Keep functions short; comment the physics (formula + source of the sign).
