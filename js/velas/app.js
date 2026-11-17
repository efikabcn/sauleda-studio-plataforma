// app.js — interfaz: entradas de obra, cálculo, vistas y exportación.
import { computeSail, FABRICS, PRETENSION, recommendedCurve } from './sail.js';
import { colorsFor, BRAND, COMMON } from './fabrics.js';
import { createViewer } from './viewer.js';
import { drawPlan, drawCutPlan } from './draw2d.js';
import { cutPlanDXF, planDXF, csvReport } from './dxf.js';
import { sunPosition, sunVector, dayLength, projectShadow } from '../core/sun.js';
import { findColor, isEstimated } from '../core/catalog.js';
import { project } from '../core/project.js';
import { t, getLang, locale } from '../core/i18n.js';
import { imperial } from '../core/market.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const VQ = '.v-velas ';   // pestañas y paneles de este módulo, no de los demás
const LET = 'ABCDEFGH';

const state = {
  n: 4,
  unit: 'mm',
  mode: 'plan',
  edges: [5000, 4000, 5000, 4000],
  diagonals: [6400],
  checks: [6406],          // diagonales de comprobación desde B (BD, BE…)
  heights: [2500, 3300, 2500, 3300],
  curves: [5, 4.5, 5, 4.5],
  curveAuto: true,
  hardware: [250, 250, 250, 250],
  result: null,
  north: 0,
  color: '#34312D',
  colorName: 'Charcoal',
  colorRef: '7915',
  photo: null,
};

const UNIT = { mm: 1, cm: 10, in: 25.4 };
const toMM = (v) => v * UNIT[state.unit];
const fromMM = (v) => v / UNIT[state.unit];
const fmt = (v, d = 0) => fromMM(v).toFixed(d);

/* ----------------------------- entradas dinámicas ---------------------------- */

function defaults(n) {
  const R = 2600, out = { edges: [], diagonals: [], checks: [], heights: [], curves: [], hardware: [] };
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    pts.push([R * Math.cos(a), R * Math.sin(a)]);
  }
  for (let i = 0; i < n; i++) {
    const q = pts[(i + 1) % n];
    out.edges.push(Math.round(Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1])));
    out.heights.push(i % 2 ? 3300 : 2500);
    out.curves.push(8);
    out.hardware.push(250);
  }
  for (let k = 2; k <= n - 2; k++) out.diagonals.push(Math.round(Math.hypot(pts[k][0] - pts[0][0], pts[k][1] - pts[0][1])));
  for (let k = 3; k < n; k++) out.checks.push(Math.round(Math.hypot(pts[k][0] - pts[1][0], pts[k][1] - pts[1][1])));
  out.curves = out.edges.map(recommendedCurve);
  out.curveAuto = true;
  return out;
}

function buildInputs() {
  const n = state.n;
  const dims = $('#dims'); dims.innerHTML = '';
  for (let i = 0; i < n; i++) {
    dims.insertAdjacentHTML('beforeend',
      `<label>${LET[i]}${LET[(i + 1) % n]} <input data-k="edges" data-i="${i}" type="number" step="10" value="${fmt(state.edges[i], state.unit === 'in' ? 2 : 0)}"></label>`);
  }
  for (let k = 0; k < state.diagonals.length; k++) {
    dims.insertAdjacentHTML('beforeend',
      `<label class="diag">A${LET[k + 2]} <input data-k="diagonals" data-i="${k}" type="number" step="10" value="${fmt(state.diagonals[k], state.unit === 'in' ? 2 : 0)}"></label>`);
  }
  for (let k = 0; k < Math.max(0, n - 3); k++) {
    const v = state.checks[k];
    dims.insertAdjacentHTML('beforeend',
      `<label class="chk">B${LET[k + 3]} <input data-k="checks" data-i="${k}" type="number" step="10" value="${v > 0 ? fmt(v, state.unit === 'in' ? 2 : 0) : ''}"></label>`);
  }
  $('#dims-hint').textContent = n === 3
    ? t('vj.dims3')
    : t('vj.dimsN', { n, d: n - 3 });
  $('#dims-diagram').innerHTML = diagramSVG(n);
  if (state.curveAuto) state.curves = state.edges.slice(0, n).map(recommendedCurve);
  $('#curve-auto').checked = state.curveAuto;

  const hs = $('#heights'); hs.innerHTML = '';
  for (let i = 0; i < n; i++) {
    hs.insertAdjacentHTML('beforeend',
      `<label>${LET[i]} <input data-k="heights" data-i="${i}" type="number" step="50" value="${fmt(state.heights[i], state.unit === 'in' ? 1 : 0)}"></label>`);
  }
  const cs = $('#curves'); cs.innerHTML = '';
  const hw = $('#hardwares'); hw.innerHTML = '';
  for (let i = 0; i < n; i++) {
    cs.insertAdjacentHTML('beforeend', `<label>${LET[i]}${LET[(i + 1) % n]} <input data-k="curves" data-i="${i}" type="number" step="0.5" value="${state.curves[i]}"></label>`);
    hw.insertAdjacentHTML('beforeend', `<label>${LET[i]} <input data-k="hardware" data-i="${i}" type="number" step="10" value="${fmt(state.hardware[i])}"></label>`);
  }
  $$('#dims input,#heights input,#curves input,#hardwares input').forEach((el) => {
    el.addEventListener('change', () => {
      const k = el.dataset.k, i = +el.dataset.i, v = parseFloat(el.value) || 0;
      if (k === 'checks') { state.checks[i] = el.value.trim() === '' ? null : toMM(v); return; }
      state[k][i] = (k === 'curves') ? v : toMM(v);
      if (k === 'curves') { state.curveAuto = false; $('#curve-auto').checked = false; }
      if (k === 'edges' && state.curveAuto) {
        state.curves[i] = recommendedCurve(state.edges[i]);
        const c = $(`#curves input[data-i="${i}"]`); if (c) c.value = state.curves[i];
      }
    });
  });
}

/** Esquema de la vela con los puntos A, B, C…: lados, diagonales de forma (desde A)
 *  y de comprobación (desde B). Es el dibujo que se manda al instalador. */
function diagramSVG(n, { big = false } = {}) {
  const W = big ? 520 : 300, H = big ? 400 : 190, R = big ? 150 : 72, cx = W / 2, cy = H / 2 + (big ? 0 : 4);
  const P = Array.from({ length: n }, (_, i) => {
    const a = ((-90 - 180 / n + (360 * i) / n) * Math.PI) / 180;
    return [cx + R * 1.25 * Math.cos(a), cy - R * Math.sin(a)];
  });
  const line = (a, b, st) => `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" ${st}/>`;
  const fs = big ? 15 : 10.5;
  const txt = (x, y, s, col, w = 600) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${fs}" font-weight="${w}" fill="${col}" text-anchor="middle" dominant-baseline="middle" font-family="Helvetica,Arial,sans-serif">${s}</text>`;
  let g = '';
  for (let k = 2; k <= n - 2; k++) g += line(P[0], P[k], 'stroke="#055e94" stroke-width="1.4" stroke-dasharray="6 4"');
  for (let k = 3; k < n; k++) g += line(P[1], P[k], 'stroke="#e67e22" stroke-width="1.4" stroke-dasharray="2 4"');
  for (let i = 0; i < n; i++) g += line(P[i], P[(i + 1) % n], 'stroke="#2c2c2c" stroke-width="2"');
  // nombres de diagonales cerca de su centro (desplazados para que no se pisen)
  for (let k = 2; k <= n - 2; k++) {
    const m = [(P[0][0] * 0.72 + P[k][0] * 0.28), (P[0][1] * 0.72 + P[k][1] * 0.28)];
    g += txt(m[0] + (big ? 14 : 10), m[1] + (big ? 4 : 3), `A${LET[k]}`, '#055e94');
  }
  for (let k = 3; k < n; k++) {
    const m = [(P[1][0] * 0.72 + P[k][0] * 0.28), (P[1][1] * 0.72 + P[k][1] * 0.28)];
    g += txt(m[0] - (big ? 14 : 10), m[1] + (big ? 4 : 3), `B${LET[k]}`, '#c0640a');
  }
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const ox = mx - cx, oy = my - cy, l = Math.hypot(ox, oy) || 1, d = big ? 16 : 11;
    g += txt(mx + (ox / l) * d, my + (oy / l) * d, `${LET[i]}${LET[(i + 1) % n]}`, '#555', 500);
  }
  P.forEach((p, i) => {
    g += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${big ? 13 : 9}" fill="#E11F1C"/>`;
    g += txt(p[0], p[1] + 0.5, LET[i], '#fff', 700);
  });
  const ly = H - (big ? 14 : 9), lx = big ? 20 : 8, ls = big ? 12 : 9.5;
  const leg = (x, st, label) => `${line([x, ly], [x + 18, ly], st)}<text x="${x + 22}" y="${ly}" font-size="${ls}" fill="#666" dominant-baseline="middle" font-family="Helvetica,Arial,sans-serif">${label}</text>`;
  const items = [['stroke="#2c2c2c" stroke-width="2"', t('ms.legSide')]];
  if (n > 3) items.push(['stroke="#055e94" stroke-width="1.4" stroke-dasharray="6 4"', t('ms.legA')],
    ['stroke="#e67e22" stroke-width="1.4" stroke-dasharray="2 4"', t('ms.legB')]);
  let x = lx;
  for (const [st, label] of items) { g += leg(x, st, label); x += 22 + label.length * ls * 0.56 + (big ? 22 : 12); }
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
}

/** Hoja imprimible para pedir las medidas al instalador. */
function printSheet() {
  const n = state.n;
  const rows = (names) => names.map((nm) => `<tr><td>${nm}</td><td></td></tr>`).join('');
  const sides = Array.from({ length: n }, (_, i) => `${LET[i]}${LET[(i + 1) % n]}`);
  const dA = Array.from({ length: Math.max(0, n - 3) }, (_, k) => `A${LET[k + 2]}`);
  const dB = Array.from({ length: Math.max(0, n - 3) }, (_, k) => `B${LET[k + 3]}`);
  const hs = Array.from({ length: n }, (_, i) => LET[i]);
  const tbl = (title, names) => names.length ? `<table><thead><tr><th>${title}</th><th>${t('ms.measure')}</th></tr></thead><tbody>${rows(names)}</tbody></table>` : '';
  const html = `<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8"><title>${t('ms.title', { n })}</title>
  <style>
    body{font:13px/1.45 Helvetica,Arial,sans-serif; color:#2c2c2c; margin:18mm}
    h1{font-size:20px; margin:0 0 4px; color:#E11F1C} .meta{display:flex; gap:24px; margin:10px 0 14px}
    .meta span{flex:1; border-bottom:1px solid #999; padding-bottom:14px}
    .grid{display:grid; grid-template-columns:1fr 1fr; gap:14px}
    table{border-collapse:collapse; width:100%; margin-bottom:10px} th,td{border:1px solid #bbb; padding:7px 8px; text-align:left}
    th{background:#f0f0f0} td:first-child{width:34%; font-weight:600} ol{padding-left:18px; margin:6px 0 12px}
    svg{width:100%; max-width:520px; display:block; margin:0 auto 10px}
    button{font:inherit; padding:6px 14px; margin-bottom:12px} @media print{button{display:none} body{margin:10mm}}
  </style></head><body>
  <button onclick="print()">${t('ms.print')}</button>
  <h1>${t('ms.title', { n })}</h1>
  <div class="meta"><span>${t('ms.job')}: ${$('#proj-name').value || ''}</span><span>${t('ms.date')}:</span><span>${t('ms.by')}:</span></div>
  ${diagramSVG(n, { big: true })}
  <b>${t('ms.how')}</b>
  <ol><li>${t('ms.i1')}</li><li>${t('ms.i2')}</li><li>${t('ms.i3')}</li><li>${t('ms.i4')}</li><li>${t('ms.i5')}</li></ol>
  <p>${t('ms.taken')}</p>
  <div class="grid"><div>${tbl(t('ms.sides'), sides)}${tbl(t('ms.heights'), hs)}</div><div>${tbl(t('ms.diagA'), dA)}${tbl(t('ms.diagB'), dB)}</div></div>
  </body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); return; }
  // ventanas emergentes bloqueadas: se descarga la hoja para abrirla e imprimirla
  download(`${slug()}_hoja_medidas.html`, html, 'text/html');
}

/* --------------------------------- cálculo --------------------------------- */

function readSpec() {
  const layout = $('#layout').value;
  return {
    n: state.n,
    edges: state.edges.slice(0, state.n),
    diagonals: state.diagonals.slice(0, Math.max(0, state.n - 3)),
    checks: Array.from({ length: Math.max(0, state.n - 3) }, (_, k) => state.checks[k] ?? null),
    heights: state.heights.slice(0, state.n),
    mode: $('#mode').value,
    hardware: state.hardware.slice(0, state.n),
    curves: state.curves.slice(0, state.n).map((v) => v / 100),
    fabricId: $('#fabric').value,
    rollWidth: parseFloat($('#rollw').value) || undefined,
    pretension: $('#pretension').value,
    hem: parseFloat($('#hem').value) || 0,
    warpPct: parseFloat($('#warp-pct').value),
    weftPct: parseFloat($('#weft-pct').value),
    seam: parseFloat($('#seam').value) || 0,
    panelLayout: layout === 'manual' ? 'fijo' : layout,
    seamAngle: layout === 'manual' ? (parseFloat($('#seam-angle').value) * Math.PI) / 180 : undefined,
    quality: 'full',
  };
}

async function calculate() {
  $('#busy').hidden = false;
  await new Promise((r) => setTimeout(r, 30));
  try {
    const r = computeSail(readSpec());
    const bad = r.checks.filter((c) => c.measured != null && !c.ok);
    if (bad.length) {
      // Las medidas no cuadran entre sí: no se deja seguir con un patrón que no encaja en obra.
      const u = (v) => `${fmt(v, state.unit === 'in' ? 2 : 0)} ${state.unit}`;
      const sgn = (v) => (v > 0 ? '+' : '') + u(v);
      const list = bad.map((c) => t('vj.chkItem', { d: c.name, m: u(c.measured), e: u(c.expected), x: sgn(c.diff), t: u(Math.max(25, c.expected * 0.005)) })).join('. ');
      throw new Error(t('vj.chkBad', { list }));
    }
    state.result = r;
    render();
  } catch (e) {
    state.result = null;
    $('#dims-check').innerHTML = '';
    $('#alerts').innerHTML = `<div class="alert bad">${e.message}</div>`;
    $('#kpis').innerHTML = '';
    $('#solar-note').textContent = '';
    if (viewer) viewer.update(null);
    ['#c-plan', '#c-cut'].forEach((c) => { const el = $(c); el.getContext('2d').clearRect(0, 0, el.width, el.height); });
    console.error(e);
  } finally {
    $('#busy').hidden = true;
  }
}

/* -------------------------------- renderizado ------------------------------- */

let viewer = null;

function render() {
  const r = state.result;
  if (!r) return;
  const m = r.metrics;

  $('#kpis').innerHTML = [
    [t('vj.kArea'), `${m.areaSurface_m2.toFixed(2)} m²`],
    [t('vj.kPanels'), `${m.panels}`],
    [t('vj.kRoll'), `${(m.rollLength_mm / 1000).toFixed(2)} m`],
    [t('vj.kFabric'), `${m.fabricArea_m2.toFixed(1)} m²`],
    [t('vj.kWaste'), `${m.waste_pct.toFixed(0)} %`],
    [t('vj.kWeight'), `${m.weight_kg.toFixed(1)} kg`],
    ...solarKpi(),
  ].map(([k, v]) => `<div class="kpi"><b>${v}</b><span>${k}</span></div>`).join('');

  const hit = findColor(state.colorRef);
  $('#solar-note').textContent = hit?.color.solar
    ? t('vj.solarNote') + (isEstimated(hit.color) ? ' ' + t('vj.estNote') : '') : '';

  // estado de las diagonales de comprobación
  const u = (v) => `${fmt(v, state.unit === 'in' ? 2 : 0)} ${state.unit}`;
  const missing = r.checks.filter((c) => c.measured == null);
  let chk = '';
  if (missing.length) chk = `<div class="alert bad">${t('vj.chkMissing', { list: missing.map((c) => c.name).join(', ') })}</div>`;
  else if (r.checks.length) chk = `<div class="alert ok">${t('vj.chkOk', { list: r.checks.map((c) => t('vj.chkOkItem', { d: c.name, x: (Math.round(c.diff) > 0 ? '+' : Math.round(c.diff) < 0 ? '' : '±') + u(Math.round(c.diff) || 0) })).join(', ') })}</div>`;
  $('#dims-check').innerHTML = chk;
  $('#alerts').innerHTML = chk + r.notes.map((n) => `<div class="alert warn">${n}</div>`).join('');

  $('#edges-table').innerHTML = table(
    [t('vj.side'), t('vj.plan'), t('vj.real'), t('vj.edge')],
    m.edgeLengths.map((L, i) => [`${LET[i]}${LET[(i + 1) % m.edgeLengths.length]}`, Math.round(m.fixingSpansPlan[i]), Math.round(m.fixingSpans[i]), Math.round(L)])
  );
  $('#panels-table').innerHTML = table(
    [t('vj.panel'), t('vj.width'), t('vj.length'), 'm²'],
    r.panels.map((p) => [p.label, Math.round(p.netWidth), Math.round(p.netLength), p.area_m2.toFixed(2)])
  );

  viewer.setSailColor(state.color, state.color2);
  viewer.update(r, { seams: $('#show-seams').checked, poleColor: $('#pole-color').value, poleRake: +$('#pole-tilt').value, keepCamera: !!viewer._seen });
  viewer._seen = true;
  updateSun();
  drawAll();
  reportDirty = true;
}

let reportDirty = true;

const table = (head, rows) =>
  `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>` +
  rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') + '</tbody></table>';

function drawAll() {
  const r = state.result;
  if (!r) return;
  const sv = currentSunVector();
  const shadow = sv && sv[2] > 0.05
    ? r.boundary.loop.map((p) => projectShadow(p, sv)).filter(Boolean)
    : [];
  drawPlan($('#c-plan'), r, { north: state.north, color: state.color, shadow });
  drawCutPlan($('#c-cut'), r, { watermark: t('vj.wmark') });
  $('#cut-info').textContent =
    t('vj.cutInfo', { n: r.metrics.panels, w: r.metrics.rollWidth, m: (r.metrics.rollLength_mm / 1000).toFixed(2) });
}

/* ----------------------------------- sol ----------------------------------- */

function currentDate() {
  const d = $('#sun-date').value ? new Date($('#sun-date').value + 'T00:00:00') : new Date();
  const mins = +$('#sun-time').value;
  d.setHours(0, mins, 0, 0);
  return d;
}
function currentSunVector() {
  const lat = parseFloat($('#lat').value), lon = parseFloat($('#lon').value);
  const { azimuth, altitude } = sunPosition(currentDate(), lat, lon);
  return sunVector(azimuth, altitude, state.north);
}
function updateSun() {
  const lat = parseFloat($('#lat').value), lon = parseFloat($('#lon').value);
  const d = currentDate();
  const { azimuth, altitude } = sunPosition(d, lat, lon);
  const v = sunVector(azimuth, altitude, state.north);
  viewer.setSun(v, altitude);
  const mins = +$('#sun-time').value;
  $('#sun-time-lbl').textContent = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  $('#north-lbl').textContent = `${state.north}°`;
  const { rise, set } = dayLength(d, lat, lon);
  const hm = (x) => x == null ? '—' : `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  $('#sun-info').textContent = t('vj.sunInfo', { az: azimuth.toFixed(0), alt: altitude.toFixed(0), rise: hm(rise), set: hm(set) });
}

let playing = null;
function togglePlay() {
  if (playing) { clearInterval(playing); playing = null; $('#sun-play').textContent = t('v.play'); return; }
  $('#sun-play').textContent = t('vj.pause');
  playing = setInterval(() => {
    const el = $('#sun-time');
    el.value = (+el.value + 10) % 1440;
    updateSun();
    if (+el.value % 60 === 0) drawAll();
  }, 60);
}

/* --------------------------------- informe --------------------------------- */

function buildReport() {
  const r = state.result, m = r.metrics;
  const img3d = viewer.snapshot();
  const plan = $('#c-plan').toDataURL('image/png');
  const cut = $('#c-cut').toDataURL('image/png');
  const cliente = $('#proj-client')?.value || '';
  $('#report').innerHTML = `
  <div class="sheet">
    <div class="rep-head">
      <img src="${BRAND.logo}" alt="${BRAND.name}">
      <div class="meta">
        ${new Date().toLocaleDateString(locale())}<br>
        ${r.fabric.name}<br>${state.colorName} · ref. ${state.colorRef}<br>
        ${t('vj.rSail', { n: state.n })}
      </div>
    </div>
    <h1>${$('#proj-name').value}</h1>
    ${cliente ? `<p class="hint">${t('vj.rClient')}: ${cliente}</p>` : ''}
    <img class="plate" src="${img3d}">

    <h2>${t('vj.rH1')}</h2>
    ${table([t('vj.rItem'), t('vj.rValue')], [
      [t('vj.rFabric'), `${r.fabric.name} · ${r.fabric.gsm} g/m² · ${r.fabric.construction}`],
      ['Color', `${state.colorName} · ${t('vj.rRef')} ${state.colorRef}${state.color2 ? ` (${t('vj.rBicolor')})` : ''}`],
      [t('vj.rWarranty'), t('c.years', { n: r.fabric.warranty_y })],
      [t('vj.kArea'), `${m.areaSurface_m2.toFixed(2)} m²`],
      [t('vj.rPerimeter'), `${(m.perimeter_mm / 1000).toFixed(2)} m`],
      [t('vj.rWeight'), `${m.weight_kg.toFixed(1)} kg`],
      [t('v.curve'), `${(r.spec.curves.reduce((a, b) => a + b, 0) / r.spec.curves.length * 100).toFixed(1)} %`],
      [t('vj.rHemSeam'), `${r.spec.hem} mm / ${r.spec.seam} mm`],
    ])}

    <h2>${t('vj.rH2')}</h2>
    ${table([t('vj.side'), t('vj.rPlanMm'), t('vj.rRealMm'), t('vj.rChordMm'), t('vj.rEdgeMm')],
      m.edgeLengths.map((L, i) => [`${LET[i]}${LET[(i + 1) % m.edgeLengths.length]}`, Math.round(m.fixingSpansPlan[i]), Math.round(m.fixingSpans[i]), Math.round(m.edgeChords[i]), Math.round(L)]))}
    ${table([t('vj.rAnchor'), t('vj.rHeightMm'), t('vj.rHwMm')],
      r.fixings.map((p, i) => [LET[i], Math.round(p[2]), Math.round(r.spec.hardware[i])]))}
    <img class="plate" src="${plan}">

    <h2>${t('vj.rH3')}</h2>
    ${table([t('vj.rItem'), t('vj.rValue')], [
      [t('vj.kPanels'), m.panels],
      [t('vj.rRollW'), `${m.rollWidth} mm`],
      [t('vj.kRoll'), t('vj.rRollUse', { m: (m.rollLength_mm / 1000).toFixed(2), a: m.fabricArea_m2.toFixed(1) })],
      [t('vj.rYield'), `${(100 - m.waste_pct).toFixed(0)} %`],
      [t('vj.rComp'), `${m.warpPct.toFixed(2)} % / ${m.weftPct.toFixed(2)} %`],
      [t('vj.rPre'), `${m.prePct.toFixed(1)} %`],
      [t('vj.rDraw'), `${m.drawWarpPct.toFixed(2)} %`],
      [t('vj.rSeamDir'), `${m.seamAngleDeg.toFixed(0)}°`],
      [t('vj.rChecks'), r.checks.length
        ? (r.verified ? r.checks.map((c) => `${c.name} ${Math.round(c.measured)} mm ✓`).join(' · ') : `<b style="color:#c8102e">${t('vj.rNotChecked')}</b>`)
        : '—'],
    ])}
    <img class="plate" src="${cut}">
    ${table([t('vj.panel'), t('vj.rFinW'), t('vj.rFinL'), t('vj.rCutW'), t('vj.rCutL'), 'm²'],
      r.panels.map((p) => [p.label, Math.round(p.netWidth), Math.round(p.netLength), Math.round(p.cutWidth), Math.round(p.cutLength), p.area_m2.toFixed(2)]))}

    <h2>${t('vj.rH4')}</h2>
    ${table([t('vj.rFeature'), t('vj.rValue')], [
      [t('vj.rYarns'), COMMON.yarns],
      [t('c.construction'), r.fabric.construction],
      [t('vj.rMass'), `${r.fabric.gsm} g/m² ± 20`],
      [t('c.thickness'), `${r.fabric.thickness_mm} mm`],
      [t('c.tensile'), `${r.fabric.tensile.warp} / ${r.fabric.tensile.weft} N/5 cm`],
      [t('c.tear'), `${r.fabric.tear.warp} / ${r.fabric.tear.weft} N`],
      [t('c.burst'), `${r.fabric.burst.warp} / ${r.fabric.burst.weft} N`],
      [t('vj.rBurstP'), `${r.fabric.burstPressure} N`],
      [t('c.fire'), r.fabric.flammability],
      [t('c.temp'), COMMON.tempRange],
      [t('c.roll'), `${COMMON.width_mm / 1000} m / ${COMMON.rollLength_m} m`],
      [t('c.certs'), COMMON.certs.join(' · ')],
    ])}

    <h2>${t('vj.rH5')}</h2>
    <ul>${r.notes.map((n) => `<li>${n}</li>`).join('') || `<li>${t('vj.rNone')}</li>`}</ul>

    <div class="rep-foot">
      <b>${BRAND.claim}</b> · ${t('vj.rSince', { b: BRAND.name, y: BRAND.since })} · ${BRAND.address} · ${BRAND.phone} · ${BRAND.site}<br>
      ${t('vj.rMade', { app: BRAND.appName })}<br>
      ${t('vj.rFoot')}
    </div>
  </div>`;
}

/* -------------------------------- exportar --------------------------------- */

function download(name, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const slug = () => ($('#proj-name').value || 'vela').replace(/[^\w\-]+/g, '_');

/* ---------------------------------- init ----------------------------------- */

function fabricHint() {
  const f = FABRICS.find((x) => x.id === $('#fabric').value);
  $('#fabric-hint').innerHTML = t('vj.fabHint', {
    gsm: f.gsm, c: f.construction, th: f.thickness_mm, L: COMMON.rollLength_m,
    tw: f.tensile.warp, tf: f.tensile.weft, fire: f.flammability, y: f.warranty_y,
  });
}

function initFabrics() {
  $('#fabric').innerHTML = FABRICS.map((f) => `<option value="${f.id}">${f.name}</option>`).join('');
  const syncColors = () => {
    const list = colorsFor($('#fabric').value);
    $('#sail-color').innerHTML = list.map((c) =>
      `<option value="${c.hex}" data-name="${c.name}" data-ref="${c.ref}" data-hex2="${c.hex2 || ''}">${c.name} · ${c.ref}${c.nuevo ? ` (${t('vj.new')})` : ''}</option>`).join('');
    const keep = list.find((c) => c.ref === state.colorRef) || list.find((c) => c.name === state.colorName) || list[0];
    state.color = keep.hex; state.colorName = keep.name; state.colorRef = keep.ref; state.color2 = keep.hex2 || null;
    $('#sail-color').value = state.color;
    $('#color-dot').style.background = state.color;
  };
  const syncFabric = () => {
    const f = FABRICS.find((x) => x.id === $('#fabric').value);
    $('#rollw').value = f.roll;
    fabricHint();
    syncCompensation();
    syncColors();
  };
  const syncCompensation = () => {
    const f = FABRICS.find((x) => x.id === $('#fabric').value);
    $('#warp-pct').value = f.warp;
    $('#weft-pct').value = f.weft;
    $('#comp-hint').className = 'hint prov';
    $('#comp-hint').textContent = t('vj.compHint');
    preHint();
  };
  $('#fabric').addEventListener('change', syncFabric);
  ['#pretension', '#warp-pct'].forEach((s) => $(s).addEventListener('change', preHint));
  syncFabric();
}

/** Explica qué compensación se dibuja en urdimbre con el pretensado elegido. */
const nf = (v) => v.toLocaleString(locale(), { maximumFractionDigits: 1 });
function preHint() {
  const p = PRETENSION[$('#pretension').value] ?? 0;
  const c = parseFloat($('#warp-pct').value) || 0;
  const w = ((1 + c / 100) / (1 + p / 100) - 1) * 100;
  $('#pre-hint').textContent = p ? t('vj.preHint', { p: nf(p), w: nf(w), c: nf(c) }) : t('vj.preHint0');
}

function wizard(kind) {
  const n = state.n;
  const avg = state.edges.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const base = Math.min(...state.heights.slice(0, n));
  if (kind === 'flat') state.heights = Array(n).fill(base);
  if (kind === 'hypar') {
    // diferencia de altura recomendada: 1/6 del lado más largo
    const t = Math.round(Math.max(...state.edges.slice(0, n)) / 6 / 50) * 50;
    state.heights = Array.from({ length: n }, (_, i) => base + (i % 2 ? t : 0));
  }
  if (kind === 'slope') {
    const drop = Math.round(avg * 0.20 / 50) * 50;
    state.heights = Array.from({ length: n }, (_, i) => base + Math.round((drop * i) / (n - 1) / 50) * 50);
  }
  buildInputs();
  calculate();
}

function init() {
  const container = $('#viewer');
  viewer = createViewer(container);
  window.__shade = { viewer, state, printSheet };   // acceso para depuración desde la consola
  initFabrics();
  buildInputs();
  $('#mode').value = 'plan';
  $('#lat').value = project.lat; $('#lon').value = project.lon;
  window.addEventListener('projectchange', (e) => {
    if (!('city' in e.detail)) return;
    $('#lat').value = project.lat; $('#lon').value = project.lon;
    updateSun(); drawAll();
  });
  $('#sun-date').value = new Date().toISOString().slice(0, 10);

  $('#npoints').addEventListener('change', (e) => {
    state.n = +e.target.value;
    Object.assign(state, defaults(state.n));
    buildInputs(); calculate();
  });
  $('#units').addEventListener('change', (e) => { state.unit = e.target.value; buildInputs(); });
  $('#layout').addEventListener('change', (e) => { $('#angle-wrap').hidden = e.target.value !== 'manual'; });
  $('#btn-calc').addEventListener('click', calculate);
  $('#btn-sheet').addEventListener('click', printSheet);
  $('#curve-auto').addEventListener('change', (e) => { state.curveAuto = e.target.checked; buildInputs(); });
  $$('#wiz-hypar,#wiz-slope,#wiz-flat').forEach((b) => b.addEventListener('click', () => wizard(b.id.replace('wiz-', ''))));

  $$(VQ + '.tabs button').forEach((b) => b.addEventListener('click', () => {
    $$(VQ + '.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    $$(VQ + '.pane').forEach((p) => p.classList.toggle('active', p.id === 'pane-' + b.dataset.tab));
    viewer.resize(); drawAll();
    if (b.dataset.tab === 'report' && state.result) { buildReport(); reportDirty = false; }
  }));

  $('#sail-color').addEventListener('change', (e) => {
    const o = e.target.selectedOptions[0];
    state.color = e.target.value;
    state.colorName = o.dataset.name;
    state.colorRef = o.dataset.ref;
    state.color2 = o.dataset.hex2 || null;
    $('#color-dot').style.background = state.color;
    viewer.setSailColor(state.color, state.color2); drawAll(); reportDirty = true;
    if (state.result) render();
  });
  $('#fov').addEventListener('input', (e) => { viewer.setFov(+e.target.value); $('#fov-lbl').textContent = e.target.value + '°'; });
  $('#snap').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = viewer.snapshot();
    a.download = `${slug()}_montaje.png`;
    a.click();
  });
  $('#pole-color').addEventListener('change', () => render());
  $('#pole-tilt').addEventListener('change', () => render());
  $('#show-seams').addEventListener('change', () => render());
  $('#show-shadow').addEventListener('change', (e) => viewer.setShadows(e.target.checked));
  $('#bg-photo').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    viewer.setPhoto(URL.createObjectURL(f));
    $('#photo-tip').hidden = false;
  });
  $('#photo-tip-close').addEventListener('click', () => { $('#photo-tip').hidden = true; });
  $('#clear-photo').addEventListener('click', () => { viewer.clearPhoto(); $('#photo-tip').hidden = true; });

  ['#lat', '#lon', '#sun-date', '#sun-time'].forEach((s) => $(s).addEventListener('input', () => { updateSun(); }));
  $('#sun-time').addEventListener('change', drawAll);
  $('#north').addEventListener('input', (e) => { state.north = +e.target.value; updateSun(); drawAll(); });
  $('#sun-play').addEventListener('click', togglePlay);

  // El plano de corte y el CSV de fabricación solo salen con las medidas comprobadas.
  const canCut = () => {
    if (!state.result) return false;
    if (state.result.verified) return true;
    alert(t('vj.blocked'));
    return false;
  };
  $('#x-dxf-cut').addEventListener('click', () => canCut() && download(`${slug()}_corte.dxf`, cutPlanDXF(state.result, { project: $('#proj-name').value })));
  $('#x-dxf-plan').addEventListener('click', () => state.result && download(`${slug()}_planta.dxf`, planDXF(state.result, { project: $('#proj-name').value })));
  $('#x-csv').addEventListener('click', () => canCut() && download(`${slug()}_fabricacion.csv`, csvReport(state.result, { project: $('#proj-name').value }), 'text/csv'));
  $('#x-print').addEventListener('click', () => {
    $$(VQ + '.tabs button').forEach((x) => x.classList.toggle('active', x.dataset.tab === 'report'));
    $$(VQ + '.pane').forEach((p) => p.classList.toggle('active', p.id === 'pane-report'));
    buildReport();
    setTimeout(() => print(), 250);
  });

  $('#btn-save').addEventListener('click', () => download(`${slug()}.json`, JSON.stringify({
    project: $('#proj-name').value, state: { ...state, result: null },
    ui: { fabric: $('#fabric').value, hem: $('#hem').value, seam: $('#seam').value, layout: $('#layout').value, pretension: $('#pretension').value, lat: $('#lat').value, lon: $('#lon').value },
  }, null, 2), 'application/json'));

  $('#file-open').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const d = JSON.parse(await f.text());
    Object.assign(state, d.state);
    if (!Array.isArray(state.checks)) state.checks = [];      // ficheros anteriores a la comprobación
    if (state.curveAuto == null) state.curveAuto = false;
    $('#proj-name').value = d.project || '';
    $('#npoints').value = state.n;
    for (const [k, v] of Object.entries(d.ui || {})) { const el = $('#' + k); if (el) el.value = v; }
    buildInputs(); calculate();
  });

  calculate();
}

/* ------------------------- integración en Sauleda Studio ------------------------ */

/**
 * Bloqueo UV y sombra del color elegido, como máximos («hasta»): al tensar, la malla
 * se abre y bajan. UV: dato de ficha (uvBlock) o de ensayo (Tuv). Sombra: dato de ficha
 * (shade) o 100 − Tv; luz visible que pasa = 100 − sombra.
 */
function solarKpi() {
  const hit = findColor(state.colorRef);
  const s = hit?.color.solar;
  if (!s) return [];
  const est = isEstimated(hit.color) ? ' *' : '';
  const uv = s.uvBlock ?? (s.Tuv != null ? 1 - s.Tuv : null);
  const shade = s.shade ?? (s.Tv != null ? 1 - s.Tv : null);
  const pct = (v) => t('vj.upTo', { v: Math.round(v * 100) });
  const out = [[uv != null ? t('vj.kBlocked') : `${t('vj.kBlocked')} (${t('vj.pending')})`, uv != null ? pct(uv) : '—']];
  if (shade != null) {
    out.push([t('vj.kLight') + (s.shade != null ? '' : est), pct(shade)]);
    out.push([t('vj.kVisible') + (s.shade != null ? '' : est), `${Math.round((1 - shade) * 100)} %`]);
  }
  return out;
}

/** ?tejido=REF: selecciona la calidad que tiene ese color y el color. */
function applyParams(params = {}) {
  const hit = params.tejido && findColor(params.tejido);
  if (!hit || !hit.family.uses.includes('velas')) return false;
  if ($('#fabric').value !== hit.family.id) {
    $('#fabric').value = hit.family.id;
    $('#fabric').dispatchEvent(new Event('change'));
  }
  const opt = [...$('#sail-color').options].find((o) => o.dataset.ref === params.tejido);
  if (opt) {
    $('#sail-color').value = opt.value;
    $('#sail-color').dispatchEvent(new Event('change'));
  }
  return true;
}

/** Unidades de obra y de viento según el sistema de la cabecera (in/mph o mm/km/h). */
function syncUnitSystem() {
  state.unit = imperial() ? 'in' : 'mm';
  $('#units').value = state.unit;
  buildInputs();
}

export function mount(params) {
  init();
  syncUnitSystem();
  applyParams(params);
  window.addEventListener('unitschange', () => { syncUnitSystem(); if (state.result) render(); });
  window.addEventListener('langchange', () => {
    buildInputs(); fabricHint(); preHint();
    if ($('#comp-hint').textContent) $('#comp-hint').textContent = t('vj.compHint');
    updateSun();
    if (state.result) calculate();   // los avisos se generan en el idioma activo
  });
}

export function show(params) {
  viewer.resize();
  if (applyParams(params) && state.result) render();
  drawAll();
}
