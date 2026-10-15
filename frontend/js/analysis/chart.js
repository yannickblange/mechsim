// chart.js - draws a chart model (analysis/models.js) on a canvas: axes with nice ticks, series, markers, rays, a legend and a read-out under the pointer.
import { decimal } from '../format.js';
import { formatTick, lowerBound, niceTicks } from '../graphs/plot.js';

const MARGIN = { left: 58, right: 14, top: 14, bottom: 34 };
const LEGEND_LINE = 14;

export function plotArea(canvas) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  return { x: MARGIN.left, y: MARGIN.top, w: w - MARGIN.left - MARGIN.right, h: h - MARGIN.top - MARGIN.bottom, width: w, height: h };
}

// The ranges that are drawn: the model's, widened so that both axes have the same scale if the model asks for it.
export function viewOf(model, plot) {
  let { min: x0, max: x1 } = model.x;
  let { min: y0, max: y1 } = model.y;
  if (model.equal) {
    const scale = Math.min(plot.w / (x1 - x0), plot.h / (y1 - y0));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    x0 = cx - plot.w / scale / 2; x1 = cx + plot.w / scale / 2;
    y0 = cy - plot.h / scale / 2; y1 = cy + plot.h / scale / 2;
  }
  return { x0, x1, y0, y1 };
}

export function drawChart(canvas, model, theme, hoverX = null) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, w, h);
  ctx.font = '11px system-ui, sans-serif';
  const plot = plotArea(canvas);
  if (plot.w < 30 || plot.h < 30) return null;
  if (!model || model.empty) {
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    wrap(ctx, (model && model.empty) || 'Noch keine Daten.', w / 2, h / 2, w - 40, 15);
    return null;
  }
  const view = viewOf(model, plot);
  const sx = (x) => plot.x + ((x - view.x0) / (view.x1 - view.x0)) * plot.w;
  const sy = (y) => plot.y + (1 - (y - view.y0) / (view.y1 - view.y0)) * plot.h;

  // grid and ticks
  const yt = niceTicks(view.y0, view.y1, Math.max(3, Math.round(plot.h / 42)));
  const xt = niceTicks(view.x0, view.x1, Math.max(3, Math.round(plot.w / 70)));
  ctx.lineWidth = 1;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (const v of yt.ticks) {
    if (v < view.y0 || v > view.y1) continue;
    const y = Math.round(sy(v)) + 0.5;
    ctx.strokeStyle = Math.abs(v) < yt.step * 1e-6 ? theme.axis : theme.gridMajor;
    ctx.beginPath(); ctx.moveTo(plot.x, y); ctx.lineTo(plot.x + plot.w, y); ctx.stroke();
    ctx.fillStyle = theme.muted;
    ctx.fillText(formatTick(v, yt.step), plot.x - 5, y);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const v of xt.ticks) {
    if (v < view.x0 || v > view.x1) continue;
    const x = Math.round(sx(v)) + 0.5;
    ctx.strokeStyle = Math.abs(v) < xt.step * 1e-6 ? theme.axis : theme.grid;
    ctx.beginPath(); ctx.moveTo(x, plot.y); ctx.lineTo(x, plot.y + plot.h); ctx.stroke();
    ctx.fillStyle = theme.muted;
    ctx.fillText(formatTick(v, xt.step), x, plot.y + plot.h + 5);
  }
  ctx.strokeStyle = theme.axis;
  ctx.strokeRect(plot.x + 0.5, plot.y + 0.5, plot.w, plot.h);
  ctx.fillStyle = theme.muted;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(model.xLabel || '', plot.x + plot.w, h - 2);
  ctx.save();
  ctx.translate(12, plot.y + plot.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(model.yLabel || '', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y, plot.w, plot.h);
  ctx.clip();
  // rays (lines of constant damping ratio)
  for (const r of model.rays || []) {
    ctx.strokeStyle = r.strong ? theme.compression : theme.muted;
    ctx.globalAlpha = r.strong ? 0.8 : 0.35;
    ctx.lineWidth = r.strong ? 1.6 : 1;
    ctx.setLineDash(r.strong ? [] : [3, 3]);
    ctx.beginPath(); ctx.moveTo(sx(r.x0), sy(r.y0)); ctx.lineTo(sx(r.x1), sy(r.y1)); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  // series
  ctx.lineJoin = 'round';
  for (const s of model.series) {
    ctx.strokeStyle = theme[s.color] || theme.ink;
    ctx.globalAlpha = s.alpha ?? 1;
    ctx.lineWidth = s.width || 1.5;
    ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < s.xs.length; i++) {
      const x = sx(s.xs[i]);
      const y = sy(s.ys[i]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  // vertical markers
  for (const v of model.vlines || []) {
    const x = Math.round(sx(v.x)) + 0.5;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(x, plot.y); ctx.lineTo(x, plot.y + plot.h); ctx.stroke();
    ctx.setLineDash([]);
  }
  // points
  for (const p of model.points || []) {
    ctx.globalAlpha = p.alpha ?? 1;
    ctx.fillStyle = theme[p.color] || theme.ink;
    ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), 4, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // labels of rays and points and markers (outside the clip, but kept inside the plot)
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.muted;
  ctx.textAlign = 'left';
  for (const r of model.rays || []) {
    if (!r.label) continue;
    const x = Math.min(plot.x + plot.w - 40, Math.max(plot.x + 2, sx(r.x1) + 3));
    ctx.fillText(r.label, x, Math.min(plot.y + plot.h - 6, Math.max(plot.y + 6, sy(r.y1) + 6)));
  }
  for (const v of model.vlines || []) {
    ctx.fillStyle = theme.accent;
    ctx.textAlign = sx(v.x) > plot.x + plot.w * 0.6 ? 'right' : 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(v.label || '', sx(v.x) + (ctx.textAlign === 'left' ? 4 : -4), plot.y + 3);
  }
  for (const p of model.points || []) {
    if (!p.label) continue;
    ctx.fillStyle = theme[p.color] || theme.ink;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = sx(p.x) > plot.x + plot.w * 0.7 ? 'right' : 'left';
    ctx.fillText(p.label, sx(p.x) + (ctx.textAlign === 'left' ? 7 : -7), sy(p.y) - 5);
  }

  // legend
  const labelled = model.series.filter((s) => s.label);
  if (labelled.length > 1 || (labelled.length === 1 && model.series.length > 1)) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    labelled.forEach((s, i) => {
      const y = plot.y + (model.vlines && model.vlines.length ? 26 : 10) + i * LEGEND_LINE;
      ctx.globalAlpha = s.alpha ?? 1;
      ctx.strokeStyle = theme[s.color] || theme.ink;
      ctx.lineWidth = 2;
      ctx.setLineDash(s.dash || []);
      ctx.beginPath(); ctx.moveTo(plot.x + 8, y); ctx.lineTo(plot.x + 26, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = theme.muted;
      ctx.fillText(s.label, plot.x + 31, y);
    });
  }

  // read-out under the pointer (charts over time or over a frequency)
  if (hoverX !== null && !model.equal) {
    const x = hoverX;
    if (x >= view.x0 && x <= view.x1) {
      const px = Math.round(sx(x)) + 0.5;
      ctx.strokeStyle = theme.muted;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px, plot.y); ctx.lineTo(px, plot.y + plot.h); ctx.stroke();
      ctx.setLineDash([]);
      const rows = [`${model.xLabel.split(' ')[0]} = ${decimal(x, Math.abs(x) < 10 ? 3 : 1)}`];
      for (const s of model.series) {
        if (!s.label || s.alpha || s.id.startsWith('env')) continue;
        const i = Math.min(s.xs.length - 1, Math.max(0, lowerBound(s.xs, x)));
        rows.push({ text: `${s.label} = ${decimal(s.ys[i], Math.abs(s.ys[i]) < 10 ? 3 : 1)}`, color: theme[s.color] });
      }
      const bw = Math.max(...rows.map((r) => ctx.measureText(typeof r === 'string' ? r : r.text).width)) + 12;
      const bx = px + 8 + bw > plot.x + plot.w ? px - 8 - bw : px + 8;
      ctx.fillStyle = theme.labelBg;
      ctx.fillRect(bx, plot.y + plot.h - 8 - rows.length * 15, bw, rows.length * 15 + 4);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      rows.forEach((r, k) => {
        ctx.fillStyle = typeof r === 'string' ? theme.ink : r.color || theme.ink;
        ctx.fillText(typeof r === 'string' ? r : r.text, bx + 6, plot.y + plot.h - 6 - rows.length * 15 + k * 15);
      });
    }
  }
  return { plot, view };
}

function wrap(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, x, y + (i - (lines.length - 1) / 2) * lineHeight));
}

// The data x under a pointer position on the canvas (for the read-out), or null outside the plot.
export function dataXAt(canvas, model, clientX) {
  if (!model || model.empty || model.equal) return null;
  const rect = canvas.getBoundingClientRect();
  const plot = plotArea(canvas);
  const px = clientX - rect.left - plot.x;
  if (px < 0 || px > plot.w) return null;
  const view = viewOf(model, plot);
  return view.x0 + (px / plot.w) * (view.x1 - view.x0);
}
