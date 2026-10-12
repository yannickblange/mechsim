// node.js - Knoten: the point mass where Stabs meet. A solid dot; the hinge rings of the Stabs that end
// in it are drawn over it, so a joined node looks like the hollow circle of a Fachwerk drawing.
const RADIUS = 4.5; // px

export function drawNode(ctx, cam, spec, entry, theme) {
  const [x, y] = cam.toScreen([entry.x, entry.y]);
  ctx.save();
  ctx.fillStyle = theme.ink;
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, RADIUS, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = theme.muted;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.id, x + RADIUS + 5, y - 9);
  ctx.restore();
}
