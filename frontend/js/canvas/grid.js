// grid.js - background grid with metre lines and axis cross.

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function drawGrid(ctx, cam, theme) {
  const [x0, yTop] = cam.toWorld([0, 0]);
  const [x1, yBottom] = cam.toWorld([cam.width, cam.height]);

  // Minor 0.1 m, major 1 m; go a decade coarser while minor lines would be < 8 px apart.
  let minor = 0.1;
  let major = 1;
  while (minor * cam.scale < 8) {
    minor *= 10;
    major *= 10;
  }

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.grid;

  // Draw by integer index to avoid accumulating floating point error.
  const sweep = (lo, hi, step, perLine) => {
    for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + 1e-9; i++) perLine(i * step, i);
  };
  const vertical = (x) => {
    const [sx] = cam.toScreen([x, 0]);
    line(ctx, sx, 0, sx, cam.height);
  };
  const horizontal = (y) => {
    const [, sy] = cam.toScreen([0, y]);
    line(ctx, 0, sy, cam.width, sy);
  };

  const isMajor = (i) => Math.round(i * (minor / major) * 1e6) % 1e6 === 0;
  sweep(x0, x1, minor, (x, i) => { if (!isMajor(i)) vertical(x); });
  sweep(yBottom, yTop, minor, (y, i) => { if (!isMajor(i)) horizontal(y); });

  // Major lines (every metre) in their own, darker grey.
  ctx.strokeStyle = theme.gridMajor;
  sweep(x0, x1, major, vertical);
  sweep(yBottom, yTop, major, horizontal);

  // Axes through the origin.
  ctx.strokeStyle = theme.axis;
  vertical(0);
  horizontal(0);
  ctx.restore();
}
