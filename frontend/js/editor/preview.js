// preview.js - draws the editor overlay on top of the scene: snap marker, the tool's preview
// (rubber band, ghost spring, force arrow ...) and the selection highlight.
import { drawBlock } from '../canvas/symbols/block.js';
import { drawLoad } from '../canvas/symbols/load.js';
import { drawSpring, drawSpringGhost } from '../canvas/symbols/spring.js';
import { drawSurface } from '../canvas/symbols/surface.js';
import {
  drawFixedSupport, drawPinSupport, drawRollerSupport,
} from '../canvas/symbols/supports.js';
import { bodyToWorld, blockCorners } from './geometry.js';
import { anchorWorld, attachedPoint } from './hit.js';

const SUPPORT_DRAW = {
  pin_support: drawPinSupport,
  fixed_support: drawFixedSupport,
  roller_support: drawRollerSupport,
};

// tool: the active tool (preview, marker); selection: { kind, id } | null.
export function drawOverlay(ctx, cam, theme, scene, tool, selection) {
  if (selection) drawSelection(ctx, cam, theme, scene, selection);
  if (!tool) return;
  const preview = tool.preview;
  if (preview) drawToolPreview(ctx, cam, theme, preview);
  if (tool.marker) drawMarker(ctx, cam, theme, tool.marker);
}

function label(ctx, cam, theme, worldPoint, text) {
  if (!text) return;
  const [x, y] = cam.toScreen(worldPoint);
  ctx.save();
  ctx.font = '12px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = 'rgba(20, 30, 25, 0.85)';
  ctx.fillRect(x + 12, y - 30, w, 20);
  ctx.fillStyle = theme.ink;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 17, y - 20);
  ctx.restore();
}

function drawToolPreview(ctx, cam, theme, pv) {
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.setLineDash([]);
  switch (pv.type) {
    case 'rect': {
      const spec = { id: '', params: { width: pv.width, height: pv.height } };
      ctx.globalAlpha = 0.6;
      drawBlock(ctx, cam, spec, { x: pv.center[0], y: pv.center[1], phi: pv.angle || 0 }, theme);
      label(ctx, cam, theme, pv.center, pv.label);
      break;
    }
    case 'circle': {
      const [cx, cy] = cam.toScreen(pv.center);
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, pv.radius * cam.scale, 0, 2 * Math.PI);
      ctx.stroke();
      label(ctx, cam, theme, pv.center, pv.label);
      break;
    }
    case 'surface':
      drawSurface(ctx, cam, { p1: pv.p1, p2: pv.p2 }, theme);
      label(ctx, cam, theme, pv.p2, pv.label);
      break;
    case 'spring':
      if (pv.ghost) {
        drawSpringGhost(ctx, cam, pv.ghost.from, pv.ghost.to, Math.hypot(pv.ghost.to[0] - pv.ghost.from[0], pv.ghost.to[1] - pv.ghost.from[1]), theme);
      }
      drawSpring(ctx, cam, {}, { p1: pv.a, p2: pv.b }, theme);
      label(ctx, cam, theme, pv.ghost ? pv.ghost.to : pv.b, pv.label);
      break;
    case 'load':
      drawLoad(ctx, cam, { params: {} }, { p1: pv.point, vector: pv.force, moment: 0, mode: 'constant' }, theme);
      label(ctx, cam, theme, pv.point, pv.label);
      break;
    case 'support':
      if (pv.valid) {
        ctx.globalAlpha = 0.6;
        SUPPORT_DRAW[pv.supportType](ctx, cam, { params: { angle: pv.angle } }, { position: pv.point }, theme);
        label(ctx, cam, theme, pv.point, pv.label);
      }
      break;
    default:
  }
  ctx.restore();
}

// What the pointer is snapping to: a small shape per kind of snap point.
function drawMarker(ctx, cam, theme, marker) {
  const [x, y] = cam.toScreen(marker.point);
  const r = 6;
  ctx.save();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = marker.kind === 'invalid' ? theme.force : theme.support;
  ctx.beginPath();
  switch (marker.kind) {
    case 'center': // circle with a cross: centre of mass
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
      break;
    case 'corner':
    case 'surface-end': // square
      ctx.rect(x - r, y - r, 2 * r, 2 * r);
      break;
    case 'edge-mid': // diamond
      ctx.moveTo(x, y - r - 1); ctx.lineTo(x + r + 1, y); ctx.lineTo(x, y + r + 1); ctx.lineTo(x - r - 1, y);
      ctx.closePath();
      break;
    case 'edge':
    case 'surface': // small ring on the line
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      break;
    case 'invalid':
      ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
      break;
    default: // inside a body / grid: a small plus
      ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y);
      ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
  }
  ctx.stroke();
  ctx.restore();
}

function drawSelection(ctx, cam, theme, scene, sel) {
  const find = (list) => list.find((o) => o.id === sel.id);
  ctx.save();
  ctx.strokeStyle = theme.support;
  ctx.fillStyle = theme.support;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([7, 4]);
  const ring = (p, r) => {
    const [x, y] = cam.toScreen(p);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.stroke();
  };
  const line = (a, b) => {
    const [ax, ay] = cam.toScreen(a);
    const [bx, by] = cam.toScreen(b);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  };
  if (sel.kind === 'body') {
    const body = find(scene.bodies);
    if (body && body.type === 'disc') {
      ring(body.position, body.params.radius * cam.scale + 5);
    } else if (body) {
      const pad = 5 / cam.scale; // outline 5 px outside the block
      const pts = blockCorners(body).map(([cx, cy]) =>
        cam.toScreen(bodyToWorld(body, [cx + Math.sign(cx) * pad, cy + Math.sign(cy) * pad])));
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.stroke();
    }
  } else if (sel.kind === 'surface') {
    const s = find(scene.surfaces);
    if (s) line(s.p1, s.p2);
  } else if (sel.kind === 'element') {
    const e = find(scene.elements);
    if (e && e.type === 'spring') {
      const a = anchorWorld(scene, e.a);
      const b = anchorWorld(scene, e.b);
      if (a && b) line(a, b);
    } else if (e) {
      const p = attachedPoint(scene, e);
      if (p) ring(p, 20);
    }
  } else if (sel.kind === 'constraint') {
    const c = find(scene.constraints);
    const p = c && attachedPoint(scene, c);
    if (p) ring(p, 22);
  }
  ctx.restore();
}
