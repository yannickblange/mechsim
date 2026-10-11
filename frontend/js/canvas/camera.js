// camera.js - world (m, y up) <-> screen (CSS px, y down) mapping.
const MIN_SCALE = 5;
const MAX_SCALE = 5000;

const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export class Camera {
  constructor() {
    this.center = [0, 0]; // world point at the middle of the canvas, m
    this.scale = 200; // px per m
    this.width = 0; // CSS px
    this.height = 0;
  }

  toScreen([x, y]) {
    return [
      this.width / 2 + (x - this.center[0]) * this.scale,
      this.height / 2 - (y - this.center[1]) * this.scale,
    ];
  }

  toWorld([sx, sy]) {
    return [
      this.center[0] + (sx - this.width / 2) / this.scale,
      this.center[1] - (sy - this.height / 2) / this.scale,
    ];
  }

  // Show `worldWidth` metres across the canvas, centred on `center`.
  fit(center, worldWidth) {
    this.center = [...center];
    this.scale = clampScale(this.width / worldWidth);
  }

  // Zoom keeping the world point under the screen position [sx, sy] fixed.
  zoomAt([sx, sy], factor) {
    const [wx, wy] = this.toWorld([sx, sy]);
    this.scale = clampScale(this.scale * factor);
    this.center = [
      wx - (sx - this.width / 2) / this.scale,
      wy + (sy - this.height / 2) / this.scale,
    ];
  }

  // Move the view so the content follows a mouse drag of (dx, dy) CSS px.
  panBy(dx, dy) {
    this.center = [this.center[0] - dx / this.scale, this.center[1] + dy / this.scale];
  }
}
