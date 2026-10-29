// i18n.js — textos en español e inglés. En el HTML: data-i18n="clave" (texto),
// data-i18n-ph (placeholder) y data-i18n-title (title). En JS: t('clave', {var}).

import { STRINGS } from './strings.js';

const KEY = 'sauleda-studio-lang';
let lang = (() => {
  try { const l = localStorage.getItem(KEY); if (l) return l; } catch { /* sin almacenamiento */ }
  return (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
})();

export const getLang = () => lang;
export const locale = () => (lang === 'en' ? 'en-US' : 'es-ES');

export function t(key, vars) {
  let s = STRINGS[lang]?.[key] ?? STRINGS.es[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
/** Texto de un objeto bilingüe {es, en} o de una cadena simple. */
export const tx = (o) => (typeof o === 'string' ? o : o[lang] ?? o.es);

export function fmt(v, d = 0) {
  return Number(v).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}

export function setLang(l) {
  lang = l;
  try { localStorage.setItem(KEY, l); } catch { /* sin almacenamiento */ }
  document.documentElement.lang = l;
  applyI18n();
  window.dispatchEvent(new CustomEvent('langchange', { detail: l }));
}
