// app.js — interfaz: entradas de obra, cálculo, vistas y exportación.
import { computeSail, FABRICS, windAdvisory } from './sail.js';
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
  heights: [2500, 3300, 2500, 3300],
  curves: [8, 8, 8, 8],
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
  const R = 2600, out = { edges: [], diagonals: [], heights: [], curves: [], hardware: [] };
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
  $('#dims-hint').textContent = n === 3
    ? t('vj.dims3')
    : t('vj.dimsN', { n, d: n - 3 });

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
      state[k][i] = (k === 'curves') ? v : toMM(v);
    });
  });
}

/* --------------------------------- cálculo --------------------------------- */

function readSpec() {
  const layout = $('#layout').value;
  return {
    n: state.n,
    edges: state.edges.slice(0, state.n),
    diagonals: state.diagonals.slice(0, Math.max(0, state.n - 3)),
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
    state.result = computeSail(readSpec());
    render();
  } catch (e) {
    state.result = null;
    $('#alerts').innerHTML = `<div class="alert bad">${e.message}</div>`;
    $('#kpis').innerHTML = '';
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
    [t('vj.kSeam'), `${m.seamAngleDeg.toFixed(0)}°`],
    [t('vj.kDist'), `${m.maxDistortion_pct.toFixed(2)} %`],
    ...solarKpi(),
  ].map(([k, v]) => `<div class="kpi"><b>${v}</b><span>${k}</span></div>`).join('');

  // viento
  const wv = parseFloat($('#wind-v').value) || 0;
  const u = $('#wind-u').value;
  const ms = u === 'kmh' ? wv / 3.6 : u === 'mph' ? wv * 0.44704 : wv;
  const wind = windAdvisory({
    speed_ms: ms, area_m2: m.areaSurface_m2, projected_m2: m.areaPlan_m2,
    corners: state.n, height_m: parseFloat($('#wind-h').value) || 2.5,
  });

  const alerts = r.notes.map((t) => `<div class="alert warn">${t}</div>`).join('');
  $('#alerts').innerHTML =
    `<div class="alert ok">${t('vj.wind', { v: wv, u, q: wind.q_kPa.toFixed(2), F: wind.total_kN.toFixed(1), c: wind.corner_kN.toFixed(1) })}
     <br><small>${t('vj.windNote')}</small></div>` + alerts;

  $('#edges-table').innerHTML = table(
    [t('vj.side'), t('vj.plan'), t('vj.real'), t('vj.edge')],
    m.edgeLengths.map((L, i) => [`${LET[i]}${LET[(i + 1) % m.edgeLengths.length]}`, Math.round(m.fixingSpansPlan[i]), Math.round(m.fixingSpans[i]), Math.round(L)])
  );
  $('#panels-table').innerHTML = table(
    [t('vj.panel'), t('vj.width'), t('vj.length'), 'm²'],
    r.panels.map((p) => [p.label, Math.round(p.netWidth), Math.round(p.netLength), p.area_m2.toFixed(2)])
  );

  viewer.setSailColor(state.color, state.color2);
  viewer.update(r, { seams: $('#show-seams').checked, poleColor: $('#pole-color').value, keepCamera: !!viewer._seen });
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
  drawCutPlan($('#c-cut'), r);
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
      [t('vj.rSeamDir'), `${m.seamAngleDeg.toFixed(0)}°`],
      [t('vj.rMaxDist'), `${m.maxDistortion_pct.toFixed(2)} %`],
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
    const pre = { low: 0.6, std: 1.0, high: 1.6 }[$('#pretension').value] ?? 1;
    $('#warp-pct').value = (f.warp * pre).toFixed(2);
    $('#weft-pct').value = (f.weft * pre).toFixed(2);
    $('#comp-hint').className = 'hint prov';
    $('#comp-hint').textContent = t('vj.compHint');
  };
  $('#fabric').addEventListener('change', syncFabric);
  $('#pretension').addEventListener('change', syncCompensation);
  syncFabric();
}

function wizard(kind) {
  const n = state.n;
  const avg = state.edges.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const base = Math.min(...state.heights.slice(0, n));
  if (kind === 'flat') state.heights = Array(n).fill(base);
  if (kind === 'hypar') {
    const t = Math.round(avg * 0.18 / 50) * 50;
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
  window.__shade = { viewer, state };   // acceso para depuración desde la consola
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
  ['#wind-v', '#wind-u', '#wind-h'].forEach((s) => $(s).addEventListener('change', () => state.result && render()));

  $('#x-dxf-cut').addEventListener('click', () => state.result && download(`${slug()}_corte.dxf`, cutPlanDXF(state.result, { project: $('#proj-name').value })));
  $('#x-dxf-plan').addEventListener('click', () => state.result && download(`${slug()}_planta.dxf`, planDXF(state.result, { project: $('#proj-name').value })));
  $('#x-csv').addEventListener('click', () => state.result && download(`${slug()}_fabricacion.csv`, csvReport(state.result, { project: $('#proj-name').value }), 'text/csv'));
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
    $('#proj-name').value = d.project || '';
    $('#npoints').value = state.n;
    for (const [k, v] of Object.entries(d.ui || {})) { const el = $('#' + k); if (el) el.value = v; }
    buildInputs(); calculate();
  });

  calculate();
}

/* ------------------------- integración en Sauleda Studio ------------------------ */

/** Radiación que el tejido deja pasar bajo la vela, según el catálogo único. */
function solarKpi() {
  const hit = findColor(state.colorRef);
  if (!hit?.color.solar) return [];
  const s = hit.color.solar, mark = isEstimated(hit.color) ? ' *' : '';
  return [[t('vj.kBlocked') + mark, `${Math.round((1 - s.Ts) * 100)} %`], [t('vj.kLight') + mark, `${Math.round(s.Tv * 100)} %`]];
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
  $('#wind-u').value = imperial() ? 'mph' : 'kmh';
  $('#wind-v').value = imperial() ? 60 : 100;
  buildInputs();
}

export function mount(params) {
  init();
  syncUnitSystem();
  applyParams(params);
  window.addEventListener('unitschange', () => { syncUnitSystem(); if (state.result) render(); });
  window.addEventListener('langchange', () => {
    buildInputs(); fabricHint();
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
