// state.js - client-side app state with change notification.
export class AppState {
  constructor() {
    this.sceneName = null;
    this.scene = null;
    this.frame = null;
    this.running = false;
    this.speed = 1;
    this.mode = null;
    this.connected = false;
    this.lastError = null;
    this.subscribers = new Set();
  }

  // Returns a function that removes the subscription.
  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  notify() {
    for (const fn of [...this.subscribers]) {
      try {
        fn(this);
      } catch (err) {
        console.error('State subscriber failed', err);
      }
    }
  }

  setScene(name, scene) {
    this.sceneName = name;
    this.scene = scene;
    this.frame = null;
    this.lastError = null;
    this.notify();
  }

  setConnected(connected) {
    this.connected = connected;
    this.notify();
  }

  // Applies one server message (contracts/protocol.md).
  applyMessage(msg) {
    switch (msg && msg.type) {
      case 'frame':
        this.frame = msg.data;
        break;
      case 'status':
        this.running = msg.running;
        this.speed = msg.speed;
        this.mode = msg.mode;
        if (msg.running) this.lastError = null;
        break;
      case 'error':
        this.lastError = msg.message;
        break;
      default:
        return;
    }
    this.notify();
  }
}
