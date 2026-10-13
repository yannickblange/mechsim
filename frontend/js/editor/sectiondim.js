// sectiondim.js - the cross section drawn like an architectural drawing: the outline with dimension lines
// (extension lines, arrows) and a spot on every dimension line where the editor places the input field of that
// dimension. Pure: returns the SVG as a string and the positions of the fields, in px of the drawing.
//
// Seen along the member axis, "up" (the direction of bending in the plane) is up the page; see section.js.
import { SECTION_FIELDS, sectionRects } from './section.js';

const BOX_W = 150; // px, the largest the section itself is drawn
const BOX_H = 140;
const MARGIN = { left: 100, right: 108, top: 46, bottom: 46 }; // room for the dimension lines and their fields
const OFFSET = 24; // distance of a dimension line from the outline
const OFFSET_LEFT = 40; // ... on the left, where a field centred on a vertical line must clear the section
const EXTENSION = 5; // extension lines reach this far beyond the dimension line
const GAP = 3; // ... and start this far from the outline
const ARROW = 7;
const STUB = 14; // dimension line outside the arrows of a small dimension
const SMALL_PX = 40; // a dimension shorter than this on the screen is drawn with the arrows outside
export const FIELD_W = 64; // px, symbol + input
export const FIELD_H = 26;

export const DRAWING = {
  width: MARGIN.left + BOX_W + MARGIN.right,
  height: MARGIN.top + BOX_H + MARGIN.bottom,
};

const px = (v) => Math.round(v * 100) / 100;

// The dimensions of each type: key, `axis` of the measure ("h" horizontal, "v" vertical), the `side` of the
// outline it is drawn on and its `span` along the axis (section coordinates). `style` "leader" and "gap" are for
// thin parts, where the field cannot sit on the dimension line itself. `echo`: the same dimension again, only
// named (the section has one t for both thicknesses of the L, and one a for both sides of the square).
function dimensions(s, box) {
  const { zl, zr, yb, yt } = box;
  switch (s.type) {
    case 'square': return [
      { key: 'a', axis: 'h', side: 'bottom', span: [zl, zr] },
      { key: 'a', axis: 'v', side: 'right', span: [yb, yt], echo: true },
    ];
    case 'L': return [
      { key: 'h', axis: 'v', side: 'left', span: [yb, yt] },
      { key: 'b', axis: 'h', side: 'bottom', span: [zl, zr] },
      { key: 't', axis: 'h', side: 'top', span: [zl, zl + s.t] },
      { key: 't', axis: 'v', side: 'right', span: [yb, yb + s.t], echo: true },
    ];
    case 'T': return [
      { key: 'b', axis: 'h', side: 'top', span: [zl, zr] },
      { key: 'h', axis: 'v', side: 'left', span: [yb, yt] },
      { key: 'tf', axis: 'v', side: 'right', span: [yt - s.tf, yt] },
      { key: 'tw', axis: 'h', side: 'bottom', span: [-s.tw / 2, s.tw / 2] },
    ];
    case 'I': return [
      { key: 'b', axis: 'h', side: 'top', span: [zl, zr] },
      { key: 'h', axis: 'v', side: 'left', span: [yb, yt] },
      { key: 'tf', axis: 'v', side: 'right', span: [yt - s.tf, yt] },
      { key: 'tw', axis: 'h', style: 'leader', at: yb + 0.3 * (yt - yb), span: [-s.tw / 2, s.tw / 2] }, // below the neutral axis
    ];
    default: return [ // H: the I turned by 90 degrees, so h is horizontal and b vertical
      { key: 'h', axis: 'h', side: 'bottom', span: [zl, zr] },
      { key: 'b', axis: 'v', side: 'left', span: [yb, yt] },
      { key: 'tf', axis: 'h', side: 'top', span: [zl, zl + s.tf] },
      { key: 'tw', axis: 'v', style: 'gap', span: [-s.tw / 2, s.tw / 2] },
    ];
  }
}

const arrow = (x, y, dx, dy) => {
  const nx = -dy;
  const ny = dx;
  const bx = x - dx * ARROW;
  const by = y - dy * ARROW;
  const w = ARROW * 0.3;
  return `M${px(x)} ${px(y)}L${px(bx + nx * w)} ${px(by + ny * w)}L${px(bx - nx * w)} ${px(by - ny * w)}Z`;
};

// { width, height, svg, fields: [{ key, symbol, x, y, echo }], body: [{ x, y, w, h }], caption }.
// (x, y) is the centre of a field; `body` are the rectangles of the section on the drawing.
export function sectionDrawing(section) {
  const rects = sectionRects(section);
  const box = {
    zl: Math.min(...rects.map((r) => r[0])),
    zr: Math.max(...rects.map((r) => r[1])),
    yb: Math.min(...rects.map((r) => r[2])),
    yt: Math.max(...rects.map((r) => r[3])),
  };
  const k = Math.min(BOX_W / (box.zr - box.zl), BOX_H / (box.yt - box.yb));
  const ox = MARGIN.left + (BOX_W - (box.zr - box.zl) * k) / 2;
  const oy = MARGIN.top + (BOX_H - (box.yt - box.yb) * k) / 2;
  const X = (z) => ox + (z - box.zl) * k;
  const Y = (y) => oy + (box.yt - y) * k;

  // the centroid: on the neutral axis (y = 0), at the area-weighted middle in z
  let area = 0;
  let moment = 0;
  for (const [z0, z1, y0, y1] of rects) {
    const a = (z1 - z0) * (y1 - y0);
    area += a;
    moment += (a * (z0 + z1)) / 2;
  }
  const cx = X(moment / area);
  const cy = Y(0);

  const body = rects
    .map(([z0, z1, y0, y1]) => `<rect x="${px(X(z0))}" y="${px(Y(y1))}" width="${px((z1 - z0) * k)}" height="${px((y1 - y0) * k)}"/>`)
    .join('');
  const r = 3;
  let dims = '';
  const fields = [];
  const spec = dimensions(section, box);

  for (const d of spec) {
    const a = d.axis === 'h' ? X(d.span[0]) : Y(d.span[1]); // along the measure, from the small pixel end
    const b = d.axis === 'h' ? X(d.span[1]) : Y(d.span[0]);
    const small = b - a < SMALL_PX;
    let path = '';
    let fx;
    let fy;

    if (d.style === 'leader') { // horizontal at mid-height, the field to the right of the section
      const y = Y(d.at);
      const end = X(box.zr) + 16;
      path += `M${px(a - STUB)} ${px(y)}H${px(a)}${arrow(a, y, 1, 0)}M${px(b)} ${px(y)}H${px(end)}${arrow(b, y, -1, 0)}`;
      fx = end + 4 + FIELD_W / 2;
      fy = y;
    } else if (d.style === 'gap') { // vertical in the middle, the field above it, in the gap between the flanges
      const x = X(0);
      path += `M${px(x)} ${px(a - STUB)}V${px(a)}${arrow(x, a, 0, 1)}M${px(x)} ${px(b)}V${px(b + STUB)}${arrow(x, b, 0, -1)}`;
      fx = x;
      fy = a - STUB - 4 - FIELD_H / 2;
    } else if (d.axis === 'h') {
      const top = d.side === 'top';
      const y = top ? Y(box.yt) - OFFSET : Y(box.yb) + OFFSET;
      const edge = top ? Y(box.yt) : Y(box.yb);
      const dir = top ? -1 : 1;
      for (const x of [a, b]) path += `M${px(x)} ${px(edge + dir * GAP)}V${px(y + dir * EXTENSION)}`;
      if (small) {
        path += `M${px(a - STUB)} ${px(y)}H${px(b + STUB)}${arrow(a, y, 1, 0)}${arrow(b, y, -1, 0)}`;
        fx = b + STUB + 6 + FIELD_W / 2;
      } else {
        path += `M${px(a)} ${px(y)}H${px(b)}${arrow(a, y, -1, 0)}${arrow(b, y, 1, 0)}`;
        fx = (a + b) / 2;
      }
      fy = y;
    } else {
      const left = d.side === 'left';
      const x = left ? X(box.zl) - (small ? OFFSET : OFFSET_LEFT) : X(box.zr) + OFFSET;
      const edge = left ? X(box.zl) : X(box.zr);
      const dir = left ? -1 : 1;
      for (const y of [a, b]) path += `M${px(edge + dir * GAP)} ${px(y)}H${px(x + dir * EXTENSION)}`;
      if (small) {
        path += `M${px(x)} ${px(a - STUB)}V${px(b + STUB)}${arrow(x, a, 0, 1)}${arrow(x, b, 0, -1)}`;
        fx = x + dir * (8 + FIELD_W / 2);
      } else {
        path += `M${px(x)} ${px(a)}V${px(b)}${arrow(x, a, 0, -1)}${arrow(x, b, 0, 1)}`;
        fx = x;
      }
      fy = (a + b) / 2;
    }
    dims += `<path d="${path}"/>`;
    fields.push({ key: d.key, symbol: d.key, x: px(fx), y: px(fy), echo: Boolean(d.echo) });
  }

  const svg = `<svg class="section-drawing" viewBox="0 0 ${DRAWING.width} ${DRAWING.height}" width="${DRAWING.width}" height="${DRAWING.height}" `
    + `role="img" aria-label="Querschnitt ${section.type} mit Bemaßung">`
    + `<g fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">${body}</g>`
    + `<g fill="none" stroke="currentColor" stroke-width="1" opacity="0.75">`
    + `<path d="M${px(X(box.zl) - 8)} ${px(cy)}H${px(X(box.zr) + 10)}" stroke-dasharray="6 3 1.5 3" stroke-width="0.9"/>`
    + `<circle cx="${px(cx)}" cy="${px(cy)}" r="${r}"/><path d="M${px(cx - r - 1)} ${px(cy)}H${px(cx + r + 1)}M${px(cx)} ${px(cy - r - 1)}V${px(cy + r + 1)}"/></g>`
    + `<text x="${px(X(box.zr) + 13)}" y="${px(cy - 3)}" font-size="10" font-style="italic" fill="currentColor" opacity="0.75">z</text>`
    + `<g fill="currentColor" stroke="currentColor" stroke-width="0.8" stroke-linejoin="round">${dims}</g></svg>`;

  const outline = rects.map(([z0, z1, y0, y1]) => ({ x: px(X(z0)), y: px(Y(y1)), w: px((z1 - z0) * k), h: px((y1 - y0) * k) }));
  return { width: DRAWING.width, height: DRAWING.height, svg, fields, body: outline, caption: 'Maße in mm' };
}

// The keys of the dimensions of a section type that have an input (the echoes are only named).
export const dimensionKeys = (type) => SECTION_FIELDS[type].map(([key]) => key);
