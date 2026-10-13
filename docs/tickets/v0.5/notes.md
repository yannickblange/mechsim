# v0.5 notes: UI update and the resonance scenario

Branch `v0.5/ui-resonance` (from `v0.4b/buckling`), not merged. Frozen files were edited with the human's explicit permission
(`frontend/index.html`, `frontend/js/main.js`, `contracts/*`).

## What was asked

1. Playing controls with a time bar and a field for `t_max`, the time the simulation runs to; icons over text.
2. The dark-mode switch as a round floating moon button in the bottom-right corner; the moon rotates and the button changes colour when toggled.
3. A scenario for an oscillation at resonance: very high magnification factor, the swings grow and grow.

## What was added

| Layer | Content |
|-------|---------|
| Contracts | `scene.schema.json`: optional top-level `t_max` (s, <= 600); `protocol.md`: commands `seek` and `tmax`, status fields `t_max` and `finished` |
| Server | `SimSession`: `t_max` (default 10 s, clamped 0.1 to 600), the run stops exactly at `t_max` (the last display frame is shortened), `step` is a no-op there, `play` at the end resets first; `seek` jumps to a time (earlier = reset + run forward) and returns the trace of the jump (<= 600 samples) so the graphs stay complete; commands validate their numbers and report errors |
| Frontend | icon buttons (play/pause toggle, step, reset), time bar (range input) with the readout `t / [t_max] s`, speed as an icon + select, Space plays/pauses; floating moon button inside the stage (rotates 360 degrees, amber <-> navy via `--c-fab-bg/-fg`) |
| Scene | `resonance` (name "Resonanz"), `t_max` 30 s |
| Tests | `tests/validation/test_v05_physics.py` (exact solution of the resonance, growth to V x static deflection), server tests for `tmax`, `seek`, stop at the end, `tests/frontend/transport.test.mjs` |

## Decisions worth knowing

- **"Critical damping ratio" read as resonance.** Critical damping (zeta = 1) has no oscillation at all, so the scene shows what the description fits:
  excitation at eta = 1 with a very small zeta. zeta = 0.02 gives V = 1/(2 zeta) = 25 and a steady amplitude of 1.27 m (F0 = 2 N, k = 4 pi^2 N/m), which still fits
  between the walls; the growth has the time constant 1/(zeta omega0) = 8 s, hence `t_max` = 30 s. For a truly unbounded growth set the damper to 0 (amplitude F0 t / (2 m omega0)),
  it then leaves the picture after about 10 s.
- **`t_max` lives on the server**, not in the browser, so the run stops on the exact step and every client agrees. A scene's own `t_max` is applied when it is loaded;
  scenes without one keep the value chosen so far, so editing a layout does not reset it.
- **Seeking is re-simulation**: the engine has no snapshots, so going back means reset + run forward (fast in native mode; at most 600 s of simulated time).
  While the thumb is held the run is paused and resumes on release (not if dropped at the end).
