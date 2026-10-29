// view.js — módulo Tejidos: catálogo, ficha técnica viva por color y comparador.
//   #/tejidos?ref=7168        abre la ficha de ese color
//   #/tejidos?familia=heavy430

import { families, family, findColor, familyName, isEstimated } from '../core/catalog.js';
import { GLAZINGS } from '../solar/params.js';
import { gtot, thermalClass } from '../solar/en52022.js';
import { t, tx, fmt, getLang } from '../core/i18n.js';

const $ = (id) => document.getElementById(id);
const STORE = 'sauleda-studio-compare';
const MAX_CMP = 4;
const REF_GLASS = GLAZINGS.find((g) => g.id === 'C');

const state = { use: '', q: '', fam: null, ref: null, cmp: [] };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function mount(params = {}) {
  try { state.cmp = (JSON.parse(localStorage.getItem(STORE)) || []).filter((r) => findColor(r)); } catch { /* sin almacenamiento */ }
  $('c-search').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); renderList(); });
  $('c-uses').addEventListener('click', (e) => {
    const b = e.target.closest('[data-use]');
    if (!b) return;
    state.use = b.dataset.use;
    $('c-uses').querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
    renderList();
  });
  $('c-families').addEventListener('click', (e) => {
    const a = e.target.closest('[data-fam]');
    if (a) selectFamily(a.dataset.fam);
  });
  document.querySelector('.v-tejidos .c-main').addEventListener('click', onAction);
  window.addEventListener('langchange', renderAll);
  show(params);
}

export function show(params = {}) {
  const hit = params.ref && findColor(params.ref);
  if (hit) { state.fam = hit.family.id; state.ref = params.ref; } else if (params.familia && family(params.familia)) selectFamily(params.familia, false);
  if (!state.fam) selectFamily(families()[0].id, false);
  renderAll();
}

function selectFamily(id, render = true) {
  state.fam = id;
  const f = family(id);
  // Si la búsqueda coincide con un color concreto, se abre ese color.
  const m = state.q && f.colors.find((c) => c.ref.toLowerCase().includes(state.q) || c.name.toLowerCase().includes(state.q));
  state.ref = m ? m.ref : f.colors[0].ref;
  if (render) renderAll();
}

function saveCmp() {
  try { localStorage.setItem(STORE, JSON.stringify(state.cmp)); } catch { /* sin almacenamiento */ }
}

function onAction(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const { act, ref } = b.dataset;
  if (act === 'color') { state.ref = ref; renderFicha(); }
  if (act === 'cmp-add' && !state.cmp.includes(ref)) {
    if (state.cmp.length >= MAX_CMP) { alert(t('c.cmpFull')); return; }
    state.cmp.push(ref); saveCmp(); renderCompare();
  }
  if (act === 'cmp-del') { state.cmp = state.cmp.filter((r) => r !== ref); saveCmp(); renderCompare(); }
  if (act === 'cmp-clear') { state.cmp = []; saveCmp(); renderCompare(); }
  if (act === 'cmp-solar') location.hash = `#/solar?tejido=${state.cmp[0]}${state.cmp[1] ? `&b=${state.cmp[1]}` : ''}`;
  if (act === 'print') window.print();
}

/* ---------------------------------- lista ----------------------------------- */

function matches(f) {
  if (state.use && !f.uses.includes(state.use)) return false;
  if (!state.q) return true;
  const hay = [f.name, f.name_en, f.range, f.material, ...f.colors.flatMap((c) => [c.ref, c.name])].join(' ').toLowerCase();
  return hay.includes(state.q);
}

function renderList() {
  const lang = getLang();
  $('c-families').innerHTML = families().filter(matches).map((f) => `
    <a data-fam="${f.id}" class="${f.id === state.fam ? 'on' : ''}">
      <b>${esc(familyName(f, lang))}</b>
      <span>${esc(f.range)} · ${t('c.colors', { n: f.colors.length })}</span>
      <i class="strip">${f.colors.slice(0, 12).map((c) => `<em style="background:${c.hex}"></em>`).join('')}</i>
    </a>`).join('');
}

/* ---------------------------------- ficha ----------------------------------- */

function renderFicha() {
  const f = family(state.fam), lang = getLang();
  const tech = [
    ['c.material', f.material], ['c.construction', f.construction],
    ['c.gsm', f.gsm && `${f.gsm} g/m²`], ['c.thickness', f.thickness_mm && `${fmt(f.thickness_mm, 1)} mm`],
    ['c.roll', f.roll_mm && `${fmt(f.roll_mm / 1000, 1)} m / ${f.rollLength_m} m`],
    ['c.tensile', f.mech && `${f.mech.tensile.warp} / ${f.mech.tensile.weft} N/5 cm`],
    ['c.tear', f.mech && `${f.mech.tear.warp} / ${f.mech.tear.weft} N`],
    ['c.burst', f.mech && `${f.mech.burst.warp} / ${f.mech.burst.weft} N`],
    ['c.fire', f.fire], ['c.temp', f.tempRange],
    ['c.warranty', f.warranty_y && t('c.years', { n: f.warranty_y })],
    ['c.certs', f.certs?.join(' · ')],
  ].filter(([, v]) => v);

  const sel = f.colors.find((c) => c.ref === state.ref);
  $('c-ficha').innerHTML = `
    <div class="fhead">
      <div>
        <span class="range">${esc(f.range)}</span>
        <h2>${esc(familyName(f, lang))}</h2>
        ${f.generic ? `<p class="hint prov">${t('c.generic')}</p>` : ''}
      </div>
    </div>
    <div class="swatches">${f.colors.map((c) => `
      <button data-act="color" data-ref="${c.ref}" class="${c.ref === state.ref ? 'on' : ''}" title="${esc(c.name)} · ${c.ref}">
        <i style="background:${c.hex2 ? `linear-gradient(135deg,${c.hex} 50%,${c.hex2} 50%)` : c.hex}"></i>
        <span>${esc(c.name)}</span><small>${f.generic ? '' : c.ref}</small>
      </button>`).join('')}
    </div>
    <div class="fgrid">
      <div class="panel">${sel ? colorDetail(f, sel) : `<p class="hint">${t('c.pick')}</p>`}</div>
      ${tech.length ? `<div class="panel"><h4>${t('c.techTitle')}</h4><table class="kv">${tech.map(([k, v]) =>
        `<tr><td>${t(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>` : ''}
    </div>`;
}

function colorDetail(f, c) {
  const s = c.solar, As = 1 - s.Ts - s.Rs;
  const src = isEstimated(c)
    ? `<span class="est">${t('c.src.est')}</span>`
    : `<span class="lab">${t('c.src.lab', { lab: esc(s.lab ?? ''), report: esc(s.report ?? ''), date: esc(s.date ?? '') })}</span>`;
  const rows = GLAZINGS.map((g) => {
    const ext = gtot({ g: g.g, U: g.U, Ts: s.Ts, Rs: s.Rs, position: 'external' });
    const int = gtot({ g: g.g, U: g.U, Ts: s.Ts, Rs: s.Rs, position: 'internal' });
    const cell = (r) => `<td>${fmt(r.gtot, 2)}</td><td><span class="cl c${thermalClass(r.gtot).cls}">${thermalClass(r.gtot).cls}</span></td>`;
    return `<tr><td>${esc(tx(g.name))}<small> g ${fmt(g.g, 2)}</small></td>${cell(ext)}${cell(int)}</tr>`;
  }).join('');
  const velas = f.uses.includes('velas');
  return `
    <div class="chead">
      <i class="big" style="background:${c.hex2 ? `linear-gradient(135deg,${c.hex} 50%,${c.hex2} 50%)` : c.hex}"></i>
      <div><h3>${esc(c.name)}</h3><span>${f.generic ? esc(familyName(f, getLang())) : `ref. ${c.ref}`}</span> ${src}</div>
    </div>
    <h4>${t('c.solarTitle')}</h4>
    <div class="solar4">
      <div><b>${fmt(s.Ts, 2)}</b><span>Ts · ${t('c.Ts')}</span></div>
      <div><b>${fmt(s.Rs, 2)}</b><span>Rs · ${t('c.Rs')}</span></div>
      <div><b>${fmt(As, 2)}</b><span>As · ${t('c.As')}</span></div>
      <div><b>${fmt(s.Tv, 2)}</b><span>Tv · ${t('c.Tv')}</span></div>
    </div>
    <h4>${t('c.gtotTitle')}</h4>
    <table class="gt">
      <thead><tr><th>${t('c.glass')}</th><th colspan="2">${t('c.ext')}</th><th colspan="2">${t('c.int')}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="actions">
      <a class="btn primary" href="#/solar?tejido=${encodeURIComponent(c.ref)}">${t('c.btnSolar')}</a>
      ${velas ? `<a class="btn" href="#/velas?tejido=${encodeURIComponent(c.ref)}">${t('c.btnVelas')}</a>` : ''}
      <button data-act="cmp-add" data-ref="${c.ref}">${t('c.btnCompare')}</button>
      <button data-act="print">${t('c.btnPrint')}</button>
    </div>`;
}

/* -------------------------------- comparador -------------------------------- */

function renderCompare() {
  const lang = getLang();
  if (!state.cmp.length) {
    $('c-compare').innerHTML = `<h4>${t('c.cmpTitle')}</h4><p class="hint">${t('c.cmpEmpty')}</p>`;
    return;
  }
  const cols = state.cmp.map((ref) => {
    const { family: f, color: c } = findColor(ref);
    const s = c.solar;
    const ext = gtot({ g: REF_GLASS.g, U: REF_GLASS.U, Ts: s.Ts, Rs: s.Rs, position: 'external' });
    const int = gtot({ g: REF_GLASS.g, U: REF_GLASS.U, Ts: s.Ts, Rs: s.Rs, position: 'internal' });
    return { ref, f, c, s, ext, int };
  });
  const row = (label, fn) => `<tr><td>${label}</td>${cols.map((x) => `<td>${fn(x)}</td>`).join('')}</tr>`;
  $('c-compare').innerHTML = `
    <div class="cmp-head">
      <h4>${t('c.cmpTitle')} <small>${t('c.cmpGlass')}</small></h4>
      <div>
        <button data-act="cmp-solar" class="primary">${t('c.cmpSolar')}</button>
        <button data-act="cmp-clear">${t('c.cmpClear')}</button>
      </div>
    </div>
    <div class="cmp-scroll"><table class="cmp">
      <thead><tr><th></th>${cols.map((x, i) => `<th><i style="background:${x.c.hex}"></i>${'ABCD'[i]} · ${esc(x.c.name)}
        <button class="x" data-act="cmp-del" data-ref="${x.ref}" title="×">×</button></th>`).join('')}</tr></thead>
      <tbody>
        ${row(t('c.row.family'), (x) => esc(familyName(x.f, lang)) + (isEstimated(x.c) ? ` <span class="est">${t('est')}</span>` : ''))}
        ${row('Ts', (x) => fmt(x.s.Ts, 2))}
        ${row('Rs', (x) => fmt(x.s.Rs, 2))}
        ${row('Tv', (x) => fmt(x.s.Tv, 2))}
        ${row(t('c.row.gtotExt'), (x) => `<b>${fmt(x.ext.gtot, 2)}</b>`)}
        ${row(t('c.row.FcExt'), (x) => fmt(x.ext.Fc, 2))}
        ${row(t('c.row.clsExt'), (x) => t(thermalClass(x.ext.gtot).label))}
        ${row(t('c.row.gtotInt'), (x) => fmt(x.int.gtot, 2))}
      </tbody>
    </table></div>`;
}

function renderAll() {
  renderList(); renderFicha(); renderCompare();
}
