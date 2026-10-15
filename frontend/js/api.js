// api.js - REST + WebSocket client (contracts/protocol.md).
const RECONNECT_DELAY_MS = 1000;

export class Api {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
    this.socket = null;
  }

  async health() {
    return this.#request('GET', '/api/health');
  }

  // Ends the program (only the packaged app allows it: health().can_quit).
  async quit() {
    return this.#request('POST', '/api/shutdown');
  }

  async listScenes() {
    return (await this.#request('GET', '/api/scenes')).scenes;
  }

  // { scenes: [...examples], user_scenes: [...saved layouts] }
  async listSceneGroups() {
    return this.#request('GET', '/api/scenes');
  }

  async getScene() {
    return this.#request('GET', '/api/scene');
  }

  // source: "example" | "user"
  async loadScene(name, source = 'example') {
    return this.#request('POST', '/api/scene/load', { name, source });
  }

  // Make a scene from the editor the active simulation (not saved). Rejects with the server's
  // message if the scene is invalid or the engine cannot run it.
  async applyScene(scene, name) {
    return this.#request('POST', '/api/scene/apply', { scene, name });
  }

  // Store the scene as a user layout called `name` (letters, digits, _ and -).
  async saveScene(name, scene) {
    return this.#request('POST', '/api/scene/save', { name, scene });
  }

  // Delete the saved layout `name` (user layouts only; the server keeps the file in user_scenes/.trash/).
  async deleteUserScene(name) {
    return this.#request('DELETE', `/api/scenes/user/${encodeURIComponent(name)}`);
  }

  // Opens the WebSocket (once) and reconnects after it closes.
  connect(onMessage, onConnectionChange) {
    if (this.socket) return;
    const scheme = location.protocol === 'https:' ? 'wss://' : 'ws://';
    const socket = new WebSocket(`${scheme}${location.host}/ws`);
    this.socket = socket;
    socket.onopen = () => onConnectionChange(true);
    socket.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        console.warn('Ignoring unparsable WebSocket message', err);
        return;
      }
      onMessage(msg);
    };
    socket.onclose = () => {
      this.socket = null;
      onConnectionChange(false);
      setTimeout(() => this.connect(onMessage, onConnectionChange), RECONNECT_DELAY_MS);
    };
  }

  // Returns true if the command was sent.
  send(cmd, extra = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ cmd, ...extra }));
    return true;
  }

  async #request(method, path, body) {
    const init = { method };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const response = await fetch(this.baseUrl + path, init);
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const data = await response.json();
        if (data && data.detail) detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
      } catch {
        // body was not JSON; keep the status text
      }
      throw new Error(detail);
    }
    return response.json();
  }
}
