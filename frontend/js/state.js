// state.js - client-side app state with change notification.
export class AppState {
  constructor() {
    this.sceneName = null;
    this.sceneSource = 'example'; // "example" | "user" | "draft"
    this.editing = false;
    this.scene = null;
    this.frame = null;
    this.running = false;
    this.speed = 1;
    this.mode = null;
    this.connected = false;
    this.lastError = null;
    this.subscribers = new Set();
    this.frameListeners = new Set(); // fn(message): every frame message, with its optional trace
    this.sceneVersion = 0; // bumped by setScene: a new scene starts new recordings
  }

  // Returns a function that removes the listener.
  onFrame(fn) {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
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

  setScene(name, scene, source = 'example') {
    this.sceneName = name;
    this.sceneSource = source;
    this.scene = scene;
    this.frame = null;
    this.lastError = null;
    this.sceneVersion++;
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
        for (const fn of [...this.frameListeners]) {
          try {
            fn(msg);
          } catch (err) {
            console.error('Frame listener failed', err);
          }
        }
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
