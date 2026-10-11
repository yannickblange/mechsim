# B1: Scenes, server and mock simulation

**Agent:** B  **Depends on:** nothing  **Branch:** `v0.1/B1-server`

## Files you own
- `python/mechsim/scene.py`
- `python/mechsim/server/app.py`, `session.py`, `routes.py`, `ws.py`, `mock.py`
- `tests/python/test_scene_schema.py`, `tests/python/test_server.py`, `tests/python/test_mock.py`

## Read only
`contracts/protocol.md` (implement exactly), `contracts/*.schema.json`, `python/mechsim/paths.py`,
`python/mechsim/protocol.py`, `tests/conftest.py`.

## Task
### scene.py
Behaviour as in the module docstring. Always access `paths.SCENES_DIR` through the module
(`from mechsim import paths` … `paths.SCENES_DIR`) so tests can monkeypatch it. Validation uses
`jsonschema.Draft202012Validator`; error strings look like `"bodies/0/params/mass: 0 is less than or equal to the minimum of 0"`.

### mock.py: MockSimulation
Implements `SimulationLike`, behaviour in the module docstring. `dt` comes from `scene_dt`.

### session.py: SimSession
- Fields: `sim_factory`, `mode`, `scene_name`, `scene`, `sim`, `running`, `speed`, `clients`.
- `async load(name)`: `load_scene`, close the old sim, build the new one, `running = False`,
  broadcast frame + status.
- `async command(msg)`: handle play / pause / reset / step / speed as in the protocol; unknown
  command → send `{"type":"error"}` to that client only. Always broadcast status afterwards.
- `async run()`: background loop, 60 Hz; while running, `sim.step(n=n)` with
  `n = max(1, round(speed / 60 / sim.dt))`, then broadcast the frame. If `step` raises:
  `running = False`, broadcast error + status. Sleep with `asyncio.sleep` and compensate for the
  time the step took (target period 1/60 s).
- `async broadcast(message)`: `send_json` to all clients; drop clients that raise.

### routes.py / ws.py / app.py
- Endpoints exactly as in `contracts/protocol.md`; errors use `HTTPException` (404/422).
- `create_app(sim_factory, mode)`: store `SimSession` on `app.state.session`; start
  `session.run()` in a FastAPI lifespan handler and cancel it on shutdown.
- Static files: `GET /` → `frontend/index.html`; mount `/css` and `/js` from `paths.FRONTEND_DIR`,
  `/tests` from `paths.REPO_ROOT / "tests" / "frontend"`. Add a middleware that sets
  `Cache-Control: no-store` on every response (avoids stale ES modules during development).
- `main()`: argparse as in the docstring. In native mode import `mechsim.sim.Simulation` lazily
  inside `main`; if the import or library loading fails, print a clear message suggesting
  `--mock` or `tools/build.sh` and exit with code 1.

## Tests
`test_scene_schema.py`: every file in `scenes/` validates; invalid variants are rejected
(missing `mass`, body type `"sphere"`, negative `k`, extra unknown key); `list_scenes()` returns
the sorted file stems; `load_scene("nope")` raises `SceneNotFound`.

`test_mock.py`: for each example scene, frames validate against `state_schema`; `step(n=10)`
advances `time` by `10 * dt`; `reset()` sets `time` to 0; `close()` twice is fine.

`test_server.py` (use `with TestClient(create_app(MockSimulation, "mock")) as client:`):
health returns mode "mock"; `/api/scenes` lists all scenes; load each scene → 200 with the scene;
unknown → 404; an invalid scene placed in a temp dir (monkeypatch `paths.SCENES_DIR`) → 422;
`GET /` returns HTML; WebSocket: receive status on connect, after `load` + `{"cmd":"step"}` a
frame arrives that validates against `state_schema` and has `t > 0`; `{"cmd":"bogus"}` yields an
error message.

## Acceptance
```bash
python3 -m pytest tests/python -v -k "scene or mock or server"
./tools/run_server.sh --mock   # http://127.0.0.1:8000/api/health returns {"ok": true, "mode": "mock", ...}
```
