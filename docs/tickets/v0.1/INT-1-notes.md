# INT-1 notes

## Frozen files changed

None.

## Files changed

- `scenes/physical_pendulum.json`, `scenes/two_mass_chain.json`, `scenes/single_mass_spring.json`:
  adjusted the `view` hint only. With the original values the pendulum bar, the ceiling anchor of
  the chain and the ceiling anchor of the single-mass scene were partly outside the canvas on a
  landscape window (the camera fits by width only). Physics and bodies are untouched.
- New: `tests/python/test_e2e_native.py` (server + native engine, 30 `step` commands per scene).

## Test summary (`./tools/run_tests.sh -rs`, clean build)

```
100% tests passed out of 48          (ctest, no skipped)
======================== 59 passed, 1 warning in 5.39s =========================   (pytest, no skipped)
```

The clean build (`rm -rf build && ./tools/build.sh`) produced no compiler warnings.

## Manual checks

Native mode: single mass period 0.629 s measured from the WebSocket frames at 1x (expected 0.628);
pendulum swings about the Festlager with the symbol at the pivot; pinned block rotates about its
corner with the spring attached; two-mass chain springs stay attached; Reset returns to t = 0;
switching scenes while running pauses and loads the new scene. Mock mode: all four scenes load
and advance. Stopping the server shows "Disconnected"; a restarted server is picked up again
within about a second without reloading.

## Looks wrong but out of scope

- `tests/validation/test_energy_conservation.py`: the ticket asks for `energy_drift < 0.02` for every
  scene. `pinned_block_spring` reaches 0.022 at dt = 1 ms. The drift halves when dt is halved
  (0.022 / 0.011 / 0.0055), so this is the first-order error of semi-implicit Euler, not a bug.
  The bound is 0.03 and a test checks the dt scaling.
- After loading a scene the status bar shows "–" for the energies until the first frame after Play
  or Step: `AppState.setScene` clears the frame (as specified) after the server's initial frame has
  already arrived.
- `tools/run_tests.sh` and `tools/run_server.sh` call `python3`, so they need the virtualenv on
  `PATH` (`PATH=$PWD/.venv/bin:$PATH ./tools/run_tests.sh`). The build needs `SDKROOT` set to the
  macOS 26 SDK on this machine (see `CLAUDE.md`).
- The camera fits by width only, so a very wide, short window can still cut off tall scenes.
