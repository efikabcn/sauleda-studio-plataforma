// market.js — mercado de la web que aloja Studio: fija idioma, unidades, moneda y
// ciudad por defecto. Se elige por URL (para incrustarlo en cada web):
//   ?market=us              → inglés, unidades imperiales, dólares, Miami
//   ?market=es              → español, métrico, euros, Barcelona
//   ?lang=en&units=metric   → cada cosa por separado
// Las unidades se pueden cambiar también en la cabecera y se recuerdan en el navegador.

const KEY = 'sauleda-studio-market';

export const MARKETS = {
  es: { lang: 'es', units: 'metric', currency: 'EUR', city: 'barcelona', price: 0.20 },
  us: { lang: 'en', units: 'imperial', currency: 'USD', city: 'miami', price: 0.15 },
};

const state = { market: 'es', units: 'metric', fromUrl: false };

/** Lee la URL y lo guardado. Devuelve el idioma que pide la URL, si pide alguno. */
export function initMarket() {
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* sin almacenamiento */ }
  const q = new URLSearchParams(location.search);
  let lang = null;
  if (MARKETS[q.get('market')]) {
    state.market = q.get('market');
    state.units = MARKETS[state.market].units;
    lang = MARKETS[state.market].lang;
    state.fromUrl = true;
  }
  if (['metric', 'imperial'].includes(q.get('units'))) state.units = q.get('units');
  if (['es', 'en'].includes(q.get('lang'))) lang = q.get('lang');
  persist();
  return lang;
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ market: state.market, units: state.units })); } catch { /* sin almacenamiento */ }
}

export const market = () => state.market;
export const marketCfg = () => MARKETS[state.market];
export const getUnits = () => state.units;
export const imperial = () => state.units === 'imperial';
export const currencySymbol = () => (MARKETS[state.market].currency === 'USD' ? '$' : '€');

export function setUnits(u) {
  state.units = u;
  persist();
  window.dispatchEvent(new CustomEvent('unitschange', { detail: u }));
}
