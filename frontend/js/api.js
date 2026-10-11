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

  async listScenes() {
    return (await this.#request('GET', '/api/scenes')).scenes;
  }

  async getScene() {
    return this.#request('GET', '/api/scene');
  }

  async loadScene(name) {
    return this.#request('POST', '/api/scene/load', { name });
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
