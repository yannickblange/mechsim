// sectionview.js - the cross section as a small inline SVG for the property popup. Pure (returns a string).
import { sectionProps, sectionRects, sectionWidth } from './section.js';

const SIZE = 84; // px, the square the drawing fits in
const PAD = 6;

// Section seen along the member axis: "up" (the direction of bending in the plane) is up the page.
// The centroid is marked, the dashed line is the axis the section bends about (z).
export function sectionSvg(section) {
  const p = sectionProps(section);
  const width = sectionWidth(section);
  const k = (SIZE - 2 * PAD) / Math.max(width, p.depth);
  const cx = SIZE / 2;
  // y = 0 is the centroid; the drawing is centred on the bounding box, not on the centroid
  const midY = (p.yTop - p.yBottom) / 2;
  const cy = SIZE / 2 + midY * k;
  const px = (v) => Math.round(v * 100) / 100;
  const rects = sectionRects(section)
    .map(([z0, z1, y0, y1]) => `<rect x="${px(cx + z0 * k)}" y="${px(cy - y1 * k)}" width="${px((z1 - z0) * k)}" height="${px((y1 - y0) * k)}"/>`)
    .join('');
  const r = 3;
  return `<svg class="section-view" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" role="img" `
    + `aria-label="Cross section ${section.type}"><g fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.4">${rects}</g>`
    + `<g stroke="currentColor" stroke-width="1" fill="none"><path d="M${px(PAD / 2)} ${px(cy)}H${px(SIZE - PAD / 2)}" stroke-dasharray="3 3" opacity="0.7"/>`
    + `<circle cx="${px(cx)}" cy="${px(cy)}" r="${r}"/><path d="M${px(cx - r)} ${px(cy)}H${px(cx + r)}M${px(cx)} ${px(cy - r)}V${px(cy + r)}"/></g></svg>`;
}
