# INT-1: Integration and end-to-end check (LAST TICKET, single agent)

**Agent:** B  **Depends on:** every other v0.1 ticket merged  **Branch:** `v0.1/INT-1`

Agent A must not have open work while this runs.

## Files you may edit
Any file in the repository, **including frozen files**, but only to fix real integration
problems. Every change to a frozen file must be listed with the reason in a new file
`docs/tickets/v0.1/INT-1-notes.md`. Do not refactor or add features.

New files: `tests/python/test_e2e_native.py`, `docs/tickets/v0.1/INT-1-notes.md`.

## Task
1. Clean build from scratch: `rm -rf build && ./tools/build.sh`. No compiler warnings in
   `native/`. Fix warnings in place.
2. `./tools/run_tests.sh`: everything green, **zero skipped tests**.
3. `tests/python/test_e2e_native.py` (`pytestmark = pytest.mark.native`): app built with
   `create_app(Simulation, "native")` and TestClient; for every example scene: load, send 30
   `step` commands over the WebSocket, every received frame validates against `state_schema`,
   `t` increases strictly, no `error` messages.
4. Manual check, native mode (`./tools/run_server.sh`), each of the four scenes:
   - single mass oscillates vertically, period about 0.63 s at speed 1×
   - pendulum swings about the Festlager, support symbol stays at the pivot
   - pinned block rotates about its corner, spring stays attached to the corner
   - two-mass chain: both springs stay attached, motion looks coupled
   - Reset returns to the initial picture; scene switching while running works
5. Same manual check in `--mock` mode still works.
6. Update `README.md` if any command changed. Record in `INT-1-notes.md`: what you changed,
   test summary lines, and anything that looked wrong but was out of scope.
7. Commit, then the human tags `v0.1.0`.

## Acceptance
`./tools/run_tests.sh` output (ctest + pytest summary) pasted into `INT-1-notes.md`,
0 failed, 0 skipped.
