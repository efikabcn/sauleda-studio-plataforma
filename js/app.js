// app.js — arranque de Sauleda Studio: carga catálogo y proyecto, cabecera común,
// idioma y rutas (#/tejidos, #/solar, #/velas). Cada módulo se carga la primera vez
// que se abre y expone mount(params) y, opcionalmente, show(params).
//   #/solar?tejido=7168   abre Solar con ese color como opción A
//   #/velas?tejido=7915   abre Velas con ese tejido y color
// Con ?app=velas (o velas/index.html) funciona como la app de velas independiente,
// sin los módulos Tejidos y Solar: es la que se regala a los confeccionadores.

import { loadCatalog, hasEstimates } from './core/catalog.js';
import { loadProject, project, cityList, updateProject } from './core/project.js';
import { applyI18n, setLang, getLang, t } from './core/i18n.js';
import { initMarket, market, marketCfg, getUnits, setUnits } from './core/market.js';
import { applyUnits } from './core/units.js';

const VIEWS = {
  tejidos: () => import('./catalogo/view.js'),
  solar: () => import('./solar/view.js'),
  velas: () => import('./velas/app.js'),
};
const mounted = {};
/** App independiente: 'velas' o null (plataforma completa). El fichero único la fija en __APP. */
const APP = globalThis.__APP || (new URLSearchParams(location.search).get('app') === 'velas' ? 'velas' : null);
const $ = (id) => document.getElementById(id);

function parseHash() {
  const [route, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  if (APP) return { route: APP, params };
  return { route: VIEWS[route] ? route : 'tejidos', params };
}

async function navigate() {
  const { route, params } = parseHash();
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === route));
  document.querySelectorAll('.modnav a').forEach((a) => a.classList.toggle('on', a.dataset.route === route));
  document.body.dataset.route = route;
  try {
    if (!mounted[route]) {
      const mod = await VIEWS[route]();
      mounted[route] = mod;
      await mod.mount(params);
    } else {
      mounted[route].show?.(params);
    }
  } catch (e) {
    console.error(e);
    const v = document.querySelector(`.view[data-view="${route}"]`);
    v.insertAdjacentHTML('afterbegin', `<div class="banner err">${t('err.boot', { msg: e.message })}</div>`);
  }
}

function initHeader() {
  $('proj-name').value = project.name;
  $('proj-client').value = project.client;
  $('proj-name').addEventListener('input', (e) => updateProject({ name: e.target.value }));
  $('proj-client').addEventListener('input', (e) => updateProject({ client: e.target.value }));
  fillCities();
  window.addEventListener('langchange', fillCities);
  $('proj-city').addEventListener('change', (e) => updateProject({ city: e.target.value }));
  $('lang').value = getLang();
  $('lang').addEventListener('change', (e) => setLang(e.target.value));
  $('unit-sys').value = getUnits();
  $('unit-sys').addEventListener('change', (e) => { setUnits(e.target.value); applyUnits(); });
  $('est-banner').hidden = !hasEstimates();
}

/** Ciudades agrupadas por país; las del mercado de la web, primero. */
function fillCities() {
  const names = new Intl.DisplayNames([getLang()], { type: 'region' });
  const home = market() === 'us' ? 'US' : 'ES';
  const countries = [...new Set(cityList().map((c) => c.country))]
    .sort((a, b) => (b === home) - (a === home) || names.of(a).localeCompare(names.of(b)));
  $('proj-city').innerHTML = countries.map((k) => `<optgroup label="${names.of(k)}">${cityList()
    .filter((c) => c.country === k).map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}</optgroup>`).join('');
  $('proj-city').value = project.city;
}

/** Cabecera y título de la app independiente de velas. */
function applyAppMode() {
  if (!APP) return;
  document.body.classList.add('solo-' + APP);
  document.querySelector('.brand').setAttribute('href', '#/velas');
  document.querySelector('.brand .app b').firstChild.textContent = 'Shade Studio ';
  document.querySelector('[data-i18n="tagline"]').dataset.i18n = 'tagline.velas';
  document.title = 'Sauleda Shade Studio';
}

async function boot() {
  applyAppMode();
  const urlLang = initMarket();
  if (urlLang) setLang(urlLang);
  const cfg = marketCfg();
  const forced = new URLSearchParams(location.search).has('market');
  await Promise.all([loadCatalog(), loadProject(cfg.city, forced ? (market() === 'us' ? 'US' : 'ES') : null)]);
  document.documentElement.lang = getLang();
  applyI18n();
  applyUnits();
  initHeader();
  window.addEventListener('hashchange', navigate);
  await navigate();
  $('boot').remove();
}

boot().catch((e) => {
  console.error(e);
  $('boot').textContent = `Sauleda Studio: ${e.message}`;
});
