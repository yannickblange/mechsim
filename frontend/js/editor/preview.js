// preview.js - draws the editor overlay on top of the scene: snap marker, the tool's preview
// (rubber band, ghost spring, force arrow ...) and the selection highlight.
import { drawBlock } from '../canvas/symbols/block.js';
import { drawFixedJoint, drawPinJoint } from '../canvas/symbols/joint.js';
import { drawLoad } from '../canvas/symbols/load.js';
import { drawRod } from '../canvas/symbols/rod.js';
import { drawRope } from '../canvas/symbols/rope.js';
import { drawSpring, drawSpringGhost } from '../canvas/symbols/spring.js';
import { drawSurface } from '../canvas/symbols/surface.js';
import {
  drawFixedSupport, drawPinSupport, drawRollerSupport,
} from '../canvas/symbols/supports.js';
import { bodyToWorld, blockCorners } from './geometry.js';
import { connectionPoints, neighbors } from './connections.js';
import { anchorWorld, attachedPoint, isLink, linkEnds } from './hit.js';

const SUPPORT_DRAW = {
  pin_support: drawPinSupport,
  fixed_support: drawFixedSupport,
  roller_support: drawRollerSupport,
};

// tool: the active tool (preview, marker); selection: { kind, id } | null.
export function drawOverlay(ctx, cam, theme, scene, tool, selection) {
  drawConnections(ctx, cam, theme, scene);
  if (selection) {
    drawNeighbors(ctx, cam, theme, scene, selection);
    drawSelection(ctx, cam, theme, scene, selection);
  }
  if (!tool) return;
  if (tool.hover && !(selection && tool.hover.id === selection.id)) drawHover(ctx, cam, theme, scene, tool.hover);
  const preview = tool.preview;
  if (preview) drawToolPreview(ctx, cam, theme, preview);
  if (tool.marker) drawMarker(ctx, cam, theme, tool.marker);
}

// Every attachment point: a small dot, and a ring where two or more things meet (or a joint or
// free-space Festlager sits), so it is clear what is joined where.
function drawConnections(ctx, cam, theme, scene) {
  ctx.save();
  ctx.lineWidth = 1.5;
  for (const c of connectionPoints(scene)) {
    const [x, y] = cam.toScreen(c.point);
    if (c.hub) {
      ctx.strokeStyle = theme.support;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
      if (c.items.length >= 3) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = theme.support;
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(String(c.items.length), x + 12, y - 10);
      }
    } else {
      ctx.fillStyle = theme.muted;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  ctx.restore();
}

function bodyPath(ctx, cam, body, pad) {
  if (body.type === 'disc') {
    const [x, y] = cam.toScreen(body.position);
    ctx.beginPath();
    ctx.arc(x, y, body.params.radius * cam.scale + pad, 0, 2 * Math.PI);
    return;
  }
  const p = pad / cam.scale; // outline `pad` px outside the block
  const pts = blockCorners(body).map(([cx, cy]) =>
    cam.toScreen(bodyToWorld(body, [cx + Math.sign(cx) * p, cy + Math.sign(cy) * p])));
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

// The things the selected object is connected to, outlined in the rope colour.
function drawNeighbors(ctx, cam, theme, scene, selection) {
  const { bodies, items } = neighbors(scene, selection);
  ctx.save();
  ctx.strokeStyle = theme.rope || theme.spring;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  ctx.setLineDash([2, 4]);
  for (const body of scene.bodies) {
    if (!bodies.has(body.id)) continue;
    bodyPath(ctx, cam, body, 5);
    ctx.stroke();
  }
  for (const o of [...scene.elements, ...scene.constraints]) {
    if (!items.has(o.id)) continue;
    const ends = o.a && o.b ? linkEnds(scene, o) : null;
    const p = ends ? null : attachedPoint(scene, o);
    ctx.beginPath();
    if (ends) {
      const [a, b] = ends.map((q) => cam.toScreen(q));
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    } else if (p) {
      const [x, y] = cam.toScreen(p);
      ctx.arc(x, y, 16, 0, 2 * Math.PI);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// What the move tool would grab: a faint outline.
function drawHover(ctx, cam, theme, scene, hover) {
  const sel = hover.type === 'end' || hover.type === 'support' || hover.type === 'pin' || hover.type === 'load'
    ? { kind: hover.kind || (hover.type === 'load' ? 'element' : 'constraint'), id: hover.id }
    : { kind: hover.type, id: hover.id };
  ctx.save();
  ctx.globalAlpha = 0.5;
  drawSelection(ctx, cam, theme, scene, sel);
  ctx.restore();
}

function label(ctx, cam, theme, worldPoint, text) {
  if (!text) return;
  const [x, y] = cam.toScreen(worldPoint);
  ctx.save();
  ctx.font = '12px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 10;
  // Right of and above the point; flipped to the other side when it would leave the canvas.
  const left = x + 12 + w > cam.width - 4 ? x - 12 - w : x + 12;
  const top = Math.max(4, y - 30);
  ctx.fillStyle = 'rgba(20, 30, 25, 0.85)';
  ctx.fillRect(left, top, w, 20);
  ctx.fillStyle = theme.ink;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + 5, top + 10);
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
    case 'link':
      if (pv.kind === 'rope') drawRope(ctx, cam, {}, { p1: pv.a, p2: pv.b, taut: true }, theme);
      else drawRod(ctx, cam, {}, { p1: pv.a, p2: pv.b }, theme);
      label(ctx, cam, theme, pv.b, pv.label);
      break;
    case 'joint':
      (pv.jointType === 'fixed_joint' ? drawFixedJoint : drawPinJoint)(ctx, cam, {}, { position: pv.point }, theme);
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
    case 'pin': // an existing free-space Festlager: ring around it
      ctx.arc(x, y, r + 5, 0, 2 * Math.PI);
      break;
    case 'joint': // joint point: ring with a dot
      ctx.arc(x, y, r + 1, 0, 2 * Math.PI);
      ctx.moveTo(x + 1.5, y);
      ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
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
    if (body) {
      bodyPath(ctx, cam, body, 5);
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
    if (c && isLink(c)) {
      const ends = linkEnds(scene, c);
      if (ends) line(ends[0], ends[1]);
    } else {
      const p = c && attachedPoint(scene, c);
      if (p) ring(p, 22);
    }
  }
  ctx.restore();
}
