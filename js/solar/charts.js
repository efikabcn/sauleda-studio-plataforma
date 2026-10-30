// charts.js — gráficos SVG mínimos (barras agrupadas y líneas), sin dependencias.

const NS = 'http://www.w3.org/2000/svg';
const W = 760, H = 240, PAD = { l: 44, r: 10, t: 10, b: 26 };

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function frame(host, yMin, yMax, ticks, fmt) {
  host.innerHTML = '';
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' }, host);
  const y = (v) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - yMin) / (yMax - yMin));
  for (let i = 0; i <= ticks; i++) {
    const v = yMin + (yMax - yMin) * i / ticks;
    el('line', { x1: PAD.l, x2: W - PAD.r, y1: y(v), y2: y(v), stroke: '#EFEFEF' }, svg);
    el('text', { x: PAD.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, svg).textContent = fmt(v);
  }
  return { svg, y };
}
function legend(host, series, extra = []) {
  const lg = document.createElement('div');
  lg.className = 'legend';
  for (const s of [...series, ...extra]) {
    const sp = document.createElement('span');
    sp.innerHTML = `<i style="background:${s.color}${s.dash ? ';height:0;border-top:2px dashed ' + s.color : ''}"></i>${s.name}`;
    lg.appendChild(sp);
  }
  host.appendChild(lg);
}

/** series: [{name, color, values[]}] con la misma longitud que labels. */
export function barChart(host, labels, series, fmtNum = (v) => Math.round(v).toLocaleString()) {
  const max = niceMax(Math.max(...series.flatMap((s) => s.values)));
  const { svg, y } = frame(host, 0, max, 4, fmtNum);
  const gw = (W - PAD.l - PAD.r) / labels.length, bw = Math.min(16, (gw - 8) / series.length);
  labels.forEach((lab, i) => {
    const x0 = PAD.l + gw * i + (gw - bw * series.length) / 2;
    series.forEach((s, j) => {
      const v = s.values[i], yy = y(v);
      const r = el('rect', { x: x0 + j * bw, y: yy, width: bw - 2, height: y(0) - yy, fill: s.color, rx: 2 }, svg);
      el('title', {}, r).textContent = `${s.name} · ${lab}: ${Math.round(v)} kWh`;
    });
    el('text', { x: PAD.l + gw * (i + 0.5), y: H - 8, 'text-anchor': 'middle' }, svg).textContent = lab;
  });
  legend(host, series);
}

/** series: [{name, color, values[], dash?}] sobre un eje x de 0..n-1. */
export function lineChart(host, labels, series, unit, refLabel = '', refValue = 26) {
  const all = series.flatMap((s) => s.values);
  const lo = Math.floor(Math.min(...all) / 5) * 5, hi = Math.ceil(Math.max(...all) / 5) * 5;
  const { svg, y } = frame(host, lo, hi === lo ? lo + 5 : hi, 4, (v) => `${Math.round(v)}${unit}`);
  const n = labels.length, x = (i) => PAD.l + (W - PAD.l - PAD.r) * i / (n - 1);
  if (refLabel && lo < refValue && hi > refValue) {
    el('line', { x1: PAD.l, x2: W - PAD.r, y1: y(refValue), y2: y(refValue), stroke: '#E67E22', 'stroke-width': 1, 'stroke-dasharray': '2 3' }, svg);
    el('text', { x: W - PAD.r, y: y(refValue) - 4, 'text-anchor': 'end', style: 'fill:#E67E22' }, svg).textContent = refLabel;
  }
  labels.forEach((lab, i) => {
    if (i % 3 === 0) el('text', { x: x(i), y: H - 8, 'text-anchor': 'middle' }, svg).textContent = lab;
  });
  for (const s of series) {
    const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.dash ? 1.5 : 2.5, 'stroke-dasharray': s.dash ? '5 4' : 'none' }, svg);
  }
  legend(host, series);
}
