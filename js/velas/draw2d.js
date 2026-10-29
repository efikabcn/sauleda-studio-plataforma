// draw2d.js — planta técnica y plano de corte sobre canvas 2D.

const LET = 'ABCDEFGH';

function setup(canvas, bounds, pad = 60) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const bw = bounds.maxX - bounds.minX, bh = bounds.maxY - bounds.minY;
  const s = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  const ox = (w - bw * s) / 2 - bounds.minX * s;
  const oy = (h - bh * s) / 2 + bounds.maxY * s;
  const T = (p) => [p[0] * s + ox, oy - p[1] * s];   // y hacia arriba
  return { ctx, T, s, w, h };
}

function boundsOf(pointSets) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const set of pointSets) for (const p of set) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  }
  return { minX, minY, maxX, maxY };
}

function poly(ctx, T, pts, { stroke, fill, dash, width = 1, close = true }) {
  ctx.save();
  ctx.setLineDash(dash || []);
  ctx.lineWidth = width;
  ctx.beginPath();
  pts.forEach((p, i) => { const q = T(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
  if (close) ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  ctx.restore();
}

function label(ctx, x, y, text, { color = '#e6eaf0', size = 11, align = 'center', bg = null, rot = 0 } = {}) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  ctx.font = `${size}px -apple-system,Segoe UI,Roboto,sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (bg) {
    const m = ctx.measureText(text);
    ctx.fillStyle = bg;
    const pad = 3, wid = m.width + pad * 2;
    ctx.fillRect(align === 'center' ? -wid / 2 : 0, -size / 2 - pad, wid, size + pad * 2);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function scaleBar(ctx, s, w, h) {
  const targets = [500, 1000, 2000, 5000, 10000];
  const len = targets.find((t) => t * s > 70) || 10000;
  const px = len * s;
  const x = w - px - 24, y = h - 26;
  ctx.save();
  ctx.strokeStyle = '#96a0ae'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + px, y);
  ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.moveTo(x + px, y - 4); ctx.lineTo(x + px, y + 4);
  ctx.stroke(); ctx.restore();
  label(ctx, x + px / 2, y + 12, len >= 1000 ? `${len / 1000} m` : `${len} mm`, { color: '#96a0ae', size: 10 });
}

/* ------------------------------ PLANTA ------------------------------ */

export function drawPlan(canvas, result, opts = {}) {
  if (!result) return;
  const { fixings, corners, boundary, metrics } = result;
  const b = boundsOf([fixings, boundary.loop, opts.shadow || []]);
  const { ctx, T, s, w, h } = setup(canvas, b, 80);

  if (opts.shadow?.length) {
    poly(ctx, T, opts.shadow, { fill: 'rgba(240,162,2,.10)', stroke: 'rgba(240,162,2,.55)', dash: [5, 5], width: 1.2 });
    const c = opts.shadow.reduce((a, q) => [a[0] + q[0] / opts.shadow.length, a[1] + q[1] / opts.shadow.length], [0, 0]);
    const q = T(c);
    label(ctx, q[0], q[1], 'sombra proyectada', { size: 10, color: 'rgba(240,162,2,.8)' });
  }

  poly(ctx, T, boundary.loop, { fill: opts.color ? hexA(opts.color, 0.32) : 'rgba(0,183,205,.16)', stroke: opts.color || '#00b7cd', width: 2 });
  poly(ctx, T, corners, { stroke: 'rgba(150,160,174,.5)', dash: [6, 5] });

  // diagonales medidas desde A
  for (let k = 2; k < fixings.length - 1; k++) {
    poly(ctx, T, [fixings[0], fixings[k]], { stroke: 'rgba(240,162,2,.45)', dash: [3, 4], close: false });
    const m = [(fixings[0][0] + fixings[k][0]) / 2, (fixings[0][1] + fixings[k][1]) / 2];
    const q = T(m);
    label(ctx, q[0], q[1], `A${LET[k]} ${Math.round(dist(fixings[0], fixings[k]))}`, { color: '#f0a202', size: 10, bg: 'rgba(18,21,26,.85)' });
  }

  // cotas de lados (entre anclajes) y borde de tela
  fixings.forEach((p, i) => {
    const q = fixings[(i + 1) % fixings.length];
    const m = T([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
    let ang = Math.atan2(-(q[1] - p[1]), q[0] - p[0]);
    if (Math.abs(ang) > Math.PI / 2) ang += Math.PI;
    label(ctx, m[0], m[1] - 12, `${Math.round(metrics.fixingSpansPlan[i])}`, { size: 11, bg: 'rgba(18,21,26,.85)', rot: ang });
    label(ctx, m[0], m[1] + 12, `tela ${Math.round(metrics.edgeLengths[i])}`, { size: 10, color: '#00b7cd', rot: ang });
  });

  // anclajes
  fixings.forEach((p, i) => {
    const q = T(p);
    ctx.save();
    ctx.strokeStyle = '#e0574a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(q[0] - 9, q[1]); ctx.lineTo(q[0] + 9, q[1]);
    ctx.moveTo(q[0], q[1] - 9); ctx.lineTo(q[0], q[1] + 9); ctx.stroke();
    ctx.restore();
    label(ctx, q[0] + 14, q[1] - 12, `${LET[i]}  h ${Math.round(p[2])}`, { align: 'left', size: 12 });
  });

  // norte
  const north = ((opts.north || 0) * Math.PI) / 180;
  ctx.save();
  ctx.translate(46, 46); ctx.rotate(-north);
  ctx.strokeStyle = '#96a0ae'; ctx.fillStyle = '#e6eaf0'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(0, -18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(-5, -12); ctx.lineTo(5, -12); ctx.closePath(); ctx.fill();
  ctx.restore();
  label(ctx, 46, 76, 'N', { color: '#96a0ae', size: 11 });
  scaleBar(ctx, s, w, h);
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function hexA(hex, a) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* --------------------------- PLANO DE CORTE --------------------------- */

export function drawCutPlan(canvas, result, opts = {}) {
  if (!result) return;
  const { nested, metrics } = result;
  const W = metrics.rollWidth, L = metrics.rollLength_mm;
  const roll = [[0, 0], [W, 0], [W, L], [0, L]];
  const { ctx, T, s, w, h } = setup(canvas, boundsOf([roll]), 46);

  poly(ctx, T, roll, { fill: 'rgba(255,255,255,.035)', stroke: '#4a525c', width: 1.5 });
  // regla cada metro
  for (let y = 0; y <= L; y += 1000) {
    const a = T([0, y]), b = T([W, y]);
    ctx.save(); ctx.strokeStyle = 'rgba(150,160,174,.16)'; ctx.setLineDash([2, 6]);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.restore();
    label(ctx, a[0] - 8, a[1], `${y / 1000} m`, { align: 'right', size: 9, color: '#96a0ae' });
  }

  for (const p of nested.placed) {
    poly(ctx, T, p.nestCut, { stroke: '#e0574a', width: 1.6, fill: 'rgba(0,183,205,.10)' });
    poly(ctx, T, p.nestNet, { stroke: '#3fbf7f', width: 1, dash: [5, 4] });
    const c = p.nestNet.reduce((a, q) => [a[0] + q[0] / p.nestNet.length, a[1] + q[1] / p.nestNet.length], [0, 0]);
    const q = T(c);
    label(ctx, q[0], q[1] - 8, `${p.label}${p.flip ? ' ⟲180°' : ''}`, { size: 14 });
    label(ctx, q[0], q[1] + 10, `${Math.round(p.netWidth)} × ${Math.round(p.netLength)} mm`, { size: 10, color: '#96a0ae' });
    // sentido de urdimbre
    ctx.save();
    ctx.strokeStyle = 'rgba(240,162,2,.75)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(q[0], q[1] + 26); ctx.lineTo(q[0], q[1] + 60); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(q[0], q[1] + 22); ctx.lineTo(q[0] - 4, q[1] + 30); ctx.lineTo(q[0] + 4, q[1] + 30);
    ctx.closePath(); ctx.fillStyle = 'rgba(240,162,2,.75)'; ctx.fill();
    ctx.restore();
    label(ctx, q[0] + 8, q[1] + 44, 'urdimbre', { align: 'left', size: 9, color: 'rgba(240,162,2,.85)' });
  }

  label(ctx, T([W / 2, L])[0], T([0, L])[1] - 16, `rollo ${W} mm × ${(L / 1000).toFixed(2)} m · merma ${metrics.waste_pct.toFixed(0)} %`, { size: 12, color: '#96a0ae' });
  scaleBar(ctx, s, w, h);
}
