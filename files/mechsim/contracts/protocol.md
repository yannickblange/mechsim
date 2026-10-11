# Server <-> browser protocol (frozen for v0.1)

## REST (JSON)

| Method | Path               | Request body       | Response |
|--------|--------------------|--------------------|----------|
| GET    | `/api/health`      | –                  | `{"ok": true, "mode": "native" \| "mock", "version": "0.1.0"}` |
| GET    | `/api/scenes`      | –                  | `{"scenes": ["single_mass_spring", ...]}` (file names in `scenes/` without `.json`, sorted) |
| GET    | `/api/scene`       | –                  | `{"name": str \| null, "scene": <scene> \| null}` |
| POST   | `/api/scene/load`  | `{"name": str}`    | `{"name": str, "scene": <scene>}`; 404 if unknown, 422 if the scene fails schema validation |

Loading a scene pauses the simulation, rebuilds it at t = 0 and pushes one `frame` message to all
WebSocket clients.

`GET /` serves `frontend/index.html`; `/css/*` and `/js/*` serve the static frontend files.

## WebSocket `/ws`

Client -> server (JSON text messages):

```json
{"cmd": "play"}
{"cmd": "pause"}
{"cmd": "reset"}
{"cmd": "step"}
{"cmd": "speed", "value": 0.5}
```

- `step` advances exactly one display frame while paused.
- `speed` scales simulated time per display frame, allowed range 0.05 to 4.0 (clamp).

Server -> client:

```json
{"type": "frame",  "data": <frame matching state.schema.json>}
{"type": "status", "running": true, "scene": "single_mass_spring", "speed": 1.0, "mode": "native"}
{"type": "error",  "message": "human readable text"}
```

- On connect the server sends one `status` and, if a scene is loaded, one `frame`.
- After every command the server sends a `status`.
- While running, the server sends `frame` messages at **60 Hz**. Each display frame advances
  simulated time by `speed / 60` s, using `n = max(1, round(speed / 60 / solver.dt))` engine steps.
