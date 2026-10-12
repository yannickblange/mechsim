# Server <-> browser protocol (v0.1; v0.2 adds scene source, `apply`, `save`)

## REST (JSON)

| Method | Path               | Request body       | Response |
|--------|--------------------|--------------------|----------|
| GET    | `/api/health`      | –                  | `{"ok": true, "mode": "native" \| "mock", "version": "0.1.0"}` |
| GET    | `/api/scenes`      | –                  | `{"scenes": ["single_mass_spring", ...], "user_scenes": ["my_layout", ...]}` (file stems of `scenes/` = examples, and of `user_scenes/` = layouts saved in the editor; both sorted) |
| GET    | `/api/scene`       | –                  | `{"name": str \| null, "source": "example" \| "user" \| "draft", "scene": <scene> \| null}` |
| POST   | `/api/scene/load`  | `{"name": str, "source"?: "example" \| "user"}` (default `example`) | `{"name", "source", "scene"}`; 404 if unknown (also for names that are not plain file stems), 422 if the scene fails validation or the engine cannot run it |
| POST   | `/api/scene/apply` | `{"scene": <scene>, "name"?: str}` | `{"name", "source": "draft", "scene"}`. Makes a scene from the editor the active simulation without saving it. 422 with a readable message if it fails the schema, has dangling references, or the engine rejects it or cannot take a first step (e.g. a singular constraint set). The previous scene stays active on any error. |
| POST   | `/api/scene/save`  | `{"name": str, "scene": <scene>}` | `{"name", "source": "user"}`. Validates (schema + references) and writes `user_scenes/<name>.json`, overwriting. `name` must match `[A-Za-z0-9_-]{1,64}`, otherwise 422. Does not change the active scene. |

`user_scenes/` can be moved with the `MECHSIM_USER_SCENES` environment variable.

Beyond the JSON schema, `validate_scene` also rejects: duplicate ids (bodies, elements and constraints share one namespace; surfaces have their own), springs, loads and supports that refer to an unknown body, supports that refer to an unknown surface, and zero-length surfaces.

Loading or applying a scene pauses the simulation, rebuilds it at t = 0 and pushes one `frame` message
to all WebSocket clients.

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
