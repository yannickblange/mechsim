# B2: Frontend API client and app state

**Agent:** B  **Depends on:** B1 merged  **Branch:** `v0.1/B2-api-state`

## Files you own
- `frontend/js/api.js`
- `frontend/js/state.js`

## Read only
`frontend/js/main.js` (exact usage, read it first), `contracts/protocol.md`.

## Task
### api.js: `export class Api`
- `constructor(baseUrl = '')` — empty means same origin.
- `async health()`, `async listScenes()` (returns the array), `async getScene()`,
  `async loadScene(name)` (POST JSON). Non-2xx → `throw new Error(detail)` where `detail` is the
  FastAPI `detail` field if present, else the status text.
- `connect(onMessage, onConnectionChange)`: open `ws://` or `wss://` (match `location.protocol`)
  to `/ws`. Parse each message as JSON and call `onMessage(obj)`; ignore unparsable messages with
  `console.warn`. `onConnectionChange(true)` on open, `(false)` on close, then reconnect after
  1000 ms. Calling `connect` twice must not open two sockets.
- `send(cmd, extra = {})`: if the socket is open, send `JSON.stringify({cmd, ...extra})` and return
  true; otherwise return false.

### state.js: `export class AppState`
- Public fields: `sceneName`, `scene`, `frame`, `running`, `speed`, `mode`, `connected`,
  `lastError` (initial: null, null, null, false, 1, null, false, null).
- `subscribe(fn)` → returns an unsubscribe function. `notify()` calls every subscriber with the
  state; a throwing subscriber must not stop the others (catch + `console.error`).
- `setScene(name, scene)`: set both, `frame = null`, `lastError = null`, notify.
- `setConnected(bool)`: set, notify.
- `applyMessage(msg)`:
  - `frame` → `this.frame = msg.data`
  - `status` → `running`, `speed`, `mode` from the message; clear `lastError` when the server
    reports `running: true`
  - `error` → `lastError = msg.message`
  - unknown `type` → ignore. Notify after each handled message.

## Acceptance
With B1 merged: `./tools/run_server.sh --mock`, open the page. The canvas stays empty until
B3/B4 land; check everything through the toolbar and status bar.
- Scene list is populated, switching scenes works, Play/Pause toggles, Step advances t while
  paused, Reset returns to t = 0, speed changes the pace of t.
- Stop the server: status shows Disconnected; restart: it reconnects within ~1 s without reload.
- No console errors. `node --check` on both files passes.
