// view.js — módulo Solar: ventana + tejido → gtot, energía y confort anual.

import { GLAZINGS, SHADE_TYPES, USES, INERTIA, ORIENTATIONS } from './params.js';
import { gtot, tvTot, thermalClass } from './en52022.js';
import { loadClimate, simulate } from './sim.js';
import { barChart, lineChart } from './charts.js';
import { families, findColor, familyName, colorLabel, isEstimated } from '../core/catalog.js';
import { project, cityById } from '../core/project.js';
import { t, tx, fmt, getLang, locale } from '../core/i18n.js';

const $ = (id) => document.getElementById(id);
const root = () => document.querySelector('.v-solar');
const STORE = 'sauleda-studio-solar';
const COLORS = { base: '#9AA0A6', A: '#E11F1C', B: '#1F3A5F' };

const DEFAULTS = {
  orient: '225', wallAz: 225, glass: 'B', use: 'oficina', inertia: 'media', type: 'brazos',
  fabA: '7168', fabB: '7915',
};
const FIELDS = ['orient', 'wallAz', 'winW', 'winH', 'frame', 'glass', 'g', 'U', 'TvG', 'use', 'inertia', 'Af', 'height',
  'facadeW', 'Uwall', 'ach', 'type', 'L', 'beta', 'a', 'control', 'threshold',
  'fabA', 'TsA', 'RsA', 'TvA', 'fabB', 'TsB', 'RsB', 'TvB', 'price', 'seer', 'cop'];

/* ------------------------------ montaje del form ---------------------------- */

const opts = (sel, items) => {
  const v = sel.value;
  sel.innerHTML = items.map(([val, txt]) => `<option value="${val}">${txt}</option>`).join('');
  if (v) sel.value = v;
};

function solarFabrics() {
  return families().filter((f) => f.uses.some((u) => u === 'toldo' || u === 'screen' || u === 'velas'));
}
function fabricOptions(sel) {
  const v = sel.value, lang = getLang();
  sel.innerHTML = solarFabrics().map((f) => `<optgroup label="${familyName(f, lang)}">${f.colors
    .map((c) => `<option value="${c.ref}">${c.name}${f.generic ? '' : ` · ${c.ref}`}</option>`).join('')}</optgroup>`).join('')
    + `<option value="custom">${t('s.customFab')}</option>`;
  if (v) sel.value = v;
}

function fillSelects() {
  opts($('orient'), [...ORIENTATIONS.map(([n, a]) => [a, `${tx(n)} (${a}°)`]), ['custom', t('s.other')]]);
  opts($('glass'), [...GLAZINGS.map((g) => [g.id, tx(g.name)]), ['custom', t('s.custom')]]);
  opts($('use'), Object.entries(USES).map(([k, u]) => [k, tx(u.name)]));
  opts($('inertia'), Object.entries(INERTIA).map(([k, u]) => [k, tx(u.name)]));
  opts($('type'), SHADE_TYPES.map((s) => [s.id, tx(s.name)]));
  fabricOptions($('fabA')); fabricOptions($('fabB'));
}

export async function mount(params = {}) {
  fillSelects();
  const saved = load();
  for (const [k, v] of Object.entries({ ...DEFAULTS, ...saved })) if ($(k)) $(k).value = v;
  if (!saved.g) applyGlass();
  if (!saved.TsA) applyFabric('A');
  if (!saved.TsB) applyFabric('B');

  $('orient').addEventListener('change', () => {
    if ($('orient').value !== 'custom') $('wallAz').value = $('orient').value;
  });
  $('wallAz').addEventListener('input', () => {
    const m = ORIENTATIONS.find(([, a]) => a === Number($('wallAz').value));
    $('orient').value = m ? String(m[1]) : 'custom';
  });
  $('glass').addEventListener('change', applyGlass);
  for (const id of ['g', 'U', 'TvG']) $(id).addEventListener('input', () => { $('glass').value = 'custom'; });
  for (const o of ['A', 'B']) {
    $('fab' + o).addEventListener('change', () => applyFabric(o));
    for (const k of ['Ts', 'Rs', 'Tv']) $(k + o).addEventListener('input', () => { $('fab' + o).value = 'custom'; marks(o); });
  }
  $('btn-print').addEventListener('click', () => window.print());
  const side = root().querySelector('.side');
  side.addEventListener('input', schedule);
  side.addEventListener('change', schedule);
  window.addEventListener('projectchange', (e) => { if ('city' in e.detail || 'name' in e.detail || 'client' in e.detail) schedule(); });
  window.addEventListener('langchange', () => { fillSelects(); run(); });
  show(params);
}

/** Al volver a la vista: si llega ?tejido=REF, se pone como opción A (y ?b=REF como B). */
export function show(params = {}) {
  let changed = false;
  for (const [key, o] of [['tejido', 'A'], ['b', 'B']]) {
    if (params[key] && findColor(params[key])) { $('fab' + o).value = params[key]; applyFabric(o); changed = true; }
  }
  if (changed) save();
  syncUi();
  run();
}

function applyGlass() {
  const gl = GLAZINGS.find((g) => g.id === $('glass').value);
  if (!gl) return;
  $('g').value = gl.g; $('U').value = gl.U; $('TvG').value = gl.Tv;
}
function applyFabric(o) {
  const hit = findColor($('fab' + o).value);
  if (hit) { const s = hit.color.solar; $('Ts' + o).value = s.Ts; $('Rs' + o).value = s.Rs; $('Tv' + o).value = s.Tv; }
  marks(o);
}
/** Muestra del color y aviso de "estimado" junto a cada opción. */
function marks(o) {
  const hit = findColor($('fab' + o).value);
  $('sw' + o).style.background = hit ? hit.color.hex : 'repeating-linear-gradient(45deg,#ddd 0 3px,#fff 3px 6px)';
  $('est' + o).hidden = !(hit && isEstimated(hit.color));
}
function syncUi() {
  $('awning').style.display = $('type').value === 'brazos' ? '' : 'none';
  $('thr-wrap').style.visibility = $('control').value === 'auto' ? '' : 'hidden';
  marks('A'); marks('B');
}

/* ---------------------------------- estado ---------------------------------- */

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(FIELDS.map((f) => [f, $(f).value])))); } catch { /* sin almacenamiento */ }
}

let timer = null;
function schedule() {
  syncUi(); save();
  clearTimeout(timer);
  timer = setTimeout(run, 250);
}

const num = (id) => Number($(id).value);

function readInputs() {
  const cfg = {
    wallAz: num('wallAz'), winW: num('winW'), winH: num('winH'), frame: num('frame') / 100,
    glass: { g: num('g'), U: num('U'), Tv: num('TvG') },
    use: $('use').value, inertia: $('inertia').value,
    Af: num('Af'), height: num('height'), facadeW: num('facadeW'), Uwall: num('Uwall'), ach: num('ach'),
  };
  const type = $('type').value;
  const shade = {
    type, control: $('control').value, threshold: num('threshold'),
    position: SHADE_TYPES.find((s) => s.id === type).position,
    geom: { L: num('L'), beta: num('beta'), a: num('a') },
  };
  const fabs = ['A', 'B'].map((o) => {
    const ref = $('fab' + o).value, hit = findColor(ref);
    return {
      opt: o, ref, hex: hit?.color.hex,
      name: hit ? colorLabel(ref, getLang()) : t('s.customName'),
      estimated: hit ? isEstimated(hit.color) : false,
      Ts: num('Ts' + o), Rs: num('Rs' + o), Tv: num('Tv' + o),
    };
  });
  const eco = { price: num('price'), seer: num('seer'), cop: num('cop') };
  return { cfg, shade, fabs, eco };
}

function validate({ cfg, fabs, eco }) {
  const vals = [cfg.wallAz, cfg.winW, cfg.winH, cfg.frame, cfg.glass.g, cfg.glass.U, cfg.Af, cfg.height,
    cfg.facadeW, cfg.Uwall, cfg.ach, eco.seer, eco.cop, ...fabs.flatMap((f) => [f.Ts, f.Rs, f.Tv])];
  if (vals.some((v) => !Number.isFinite(v))) return 's.err.fields';
  if (cfg.winW * cfg.winH > cfg.facadeW * cfg.height) return 's.err.window';
  if (fabs.some((f) => f.Ts + f.Rs > 1)) return 's.err.sum';
  if (cfg.ach <= 0 || cfg.Af <= 0) return 's.err.area';
  return null;
}

/* --------------------------------- cálculo ---------------------------------- */

let runId = 0;
async function run() {
  if (!root().classList.contains('active')) return;   // se recalcula al volver a la vista
  const id = ++runId;
  const inp = readInputs();
  const err = validate(inp);
  const st = $('status');
  if (err) { st.textContent = t(err); st.className = 'status err'; return; }
  st.textContent = t('s.calc'); st.className = 'status';

  const clim = await loadClimate(project.city);
  if (id !== runId) return;
  const { cfg, shade, fabs, eco } = inp;
  const cost = (r) => {
    const elec = r.cool / eco.seer + r.heat / eco.cop;
    return { elec, eur: elec * eco.price };
  };

  const base = { key: 'base', name: t('s.noShade'), gt: cfg.glass.g, Fc: 1, tv: cfg.glass.Tv, warnings: [],
    hv: simulate(clim, cfg, null, true), fr: simulate(clim, cfg, null, false) };
  const options = fabs.map((f) => {
    const r = gtot({ g: cfg.glass.g, U: cfg.glass.U, Ts: f.Ts, Rs: f.Rs, position: shade.position });
    const sh = { ...shade, gt: r.gtot };
    return { key: f.opt, name: f.name, fab: f, gt: r.gtot, Fc: r.Fc, tv: tvTot(f.Tv, cfg.glass.Tv), warnings: r.warnings,
      hv: simulate(clim, cfg, sh, true), fr: simulate(clim, cfg, sh, false) };
  });
  const all = [base, ...options];
  for (const o of all) Object.assign(o, cost(o.hv));

  st.textContent = t('s.status', { city: clim.name, src: clim.source, h: fmt(all[1].hv.deployedH) });
  render(clim, cfg, shade, all);
}

/* --------------------------------- pintado ---------------------------------- */

function render(clim, cfg, shade, all) {
  const [base, A, B] = all;
  const best = A.eur <= B.eur ? A : B;
  const dE = base.elec - best.elec, dEur = base.eur - best.eur;
  const h0 = base.fr.h26, h1 = best.fr.h26;
  const orientName = ORIENTATIONS.find(([, a]) => a === cfg.wallAz);
  const orient = orientName ? tx(orientName[0]) : `${cfg.wallAz}°`;
  $('s-city').textContent = t('s.city', { city: cityById(project.city)?.name ?? project.city });
  $('headline').innerHTML = dE > 0
    ? t('s.headline', {
      city: clim.name, orient, type: tx(SHADE_TYPES.find((s) => s.id === shade.type).short), fabric: best.name,
      kwh: fmt(dE), eur: fmt(dEur), h0: fmt(h0), h1: fmt(h1), pct: fmt(h0 ? (1 - h1 / h0) * 100 : 0),
    })
    : t('s.headlineNo', { city: clim.name, orient });

  $('cards').innerHTML = all.map((o) => {
    const isBase = o.key === 'base';
    const sw = isBase ? '' : `<span class="sw" style="background:${o.fab.hex ?? '#ddd'}"></span>`;
    const pct = (a, b) => (b > 0 ? ` <span class="save">−${fmt((1 - a / b) * 100)} %</span>` : '');
    const est = !isBase && o.fab.estimated ? ` <span class="est">${t('est')}</span>` : '';
    return `<div class="card ${o.key}">
      <div class="ttl">${sw}${isBase ? t('s.noShade') : t('s.opt', { k: o.key }) + ' · ' + o.name}</div>
      <div class="sub">${isBase ? t('s.glassOnly') : `Ts ${fmt(o.fab.Ts, 2)} · Rs ${fmt(o.fab.Rs, 2)} · Tv ${fmt(o.fab.Tv, 2)}${est}`}</div>
      <div class="big">
        <div><b>${fmt(o.gt, 2)}</b><span>gtot</span></div>
        <div><b>${fmt(o.Fc, 2)}</b><span>Fc</span></div>
        <div><b>${fmt(o.tv * 100)} %</b><span>${t('s.light')}</span></div>
      </div>
      ${isBase ? '' : `<div class="cls">${t(thermalClass(o.gt).label)}</div>`}
      <table>
        <tr><td>${t('s.r.cool')}</td><td>${fmt(o.hv.cool)}${isBase ? '' : pct(o.hv.cool, base.hv.cool)}</td></tr>
        <tr><td>${t('s.r.heat')}</td><td>${fmt(o.hv.heat)}</td></tr>
        <tr><td>${t('s.r.peak')}</td><td>${fmt(o.hv.peakCool / 1000, 1)} kW</td></tr>
        <tr><td>${t('s.r.elec')}</td><td>${fmt(o.elec)}</td></tr>
        <tr><td>${t('s.r.cost')}</td><td>${fmt(o.eur)} €${isBase ? '' : ` <span class="save">${o.eur <= base.eur ? '−' : '+'}${fmt(Math.abs(base.eur - o.eur))} €</span>`}</td></tr>
        <tr><td>${t('s.r.h26')}</td><td>${fmt(o.fr.h26)}</td></tr>
        <tr><td>${t('s.r.max')}</td><td>${fmt(o.fr.maxOp, 1)} °C</td></tr>
      </table>
      ${o.warnings.length ? `<div class="warn">${t('s.warnRange', { list: o.warnings.map((w) => t(w)).join('; ') })}</div>` : ''}
    </div>`;
  }).join('');

  const months = t('months').split(',');
  const series = all.map((o) => ({ name: o.key === 'base' ? t('s.noShade') : `${o.key} · ${o.name}`, color: COLORS[o.key] }));
  barChart($('chart-month'), months, series.map((s, i) => ({ ...s, values: Array.from(all[i].hv.coolM) })), (v) => fmt(v));

  const d = new Date(Date.UTC(2025, 0, 1 + clim.hotDay));
  $('hotday-label').textContent = t('s.hotday', { d: `${d.getUTCDate()} ${t('monthsLong').split(',')[d.getUTCMonth()]}` });
  lineChart($('chart-day'), [...Array(24).keys()].map((h) => `${h}h`),
    [...series.map((s, i) => ({ ...s, values: Array.from(all[i].fr.hotDay) })),
      { name: t('s.exterior'), color: '#E67E22', dash: true, values: Array.from(base.fr.hotDayTe) }], '°', t('s.comfort'));

  $('ph-name').textContent = project.name || 'Sauleda Studio';
  $('ph-meta').textContent = [project.client, clim.name, t('s.meta.orient', { o: orient }),
    t('s.meta.window', { w: fmt(cfg.winW, 1), h: fmt(cfg.winH, 1) }), new Date().toLocaleDateString(locale())].filter(Boolean).join(' · ');
}
