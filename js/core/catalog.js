// catalog.js — catálogo único de tejidos (data/fabrics.json). Es la fuente de verdad
// para los tres módulos: ficha, solar y velas. Los datos solares de cada color llevan
// `source`: 'estimado' (provisional), 'ficha' (ficha técnica de Sauleda, sin informe de
// laboratorio; `est` lista los valores que aun así se han estimado) o 'ensayo' (laboratorio).

import { getJSON } from './data.js';

let data = null;
const byRef = new Map();

export async function loadCatalog() {
  data = await getJSON('data/fabrics.json');
  byRef.clear();
  for (const f of data.families) for (const c of f.colors) {
    byRef.set(c.ref, { family: f, color: c });
    for (const a of c.alt ?? []) byRef.set(a, { family: f, color: c });   // misma tela, otro ancho
  }
  return data;
}

export const catalogVersion = () => data.version;
export const families = () => data.families;
export const family = (id) => data.families.find((f) => f.id === id);
/** { family, color } del color con esa referencia, o undefined. */
export const findColor = (ref) => byRef.get(ref);
/** Ts y Rs provisionales (no vienen de ficha técnica ni de ensayo). */
export const isEstimated = (color) => !color.solar || color.solar.source === 'estimado';
export const hasEstimates = () => [...byRef.values()].some(({ color }) => isEstimated(color));

/** Campo de texto de una familia en el idioma pedido (bloque "en" del catálogo, si existe). */
export function familyText(f, field, lang) {
  return (lang === 'en' && f.en?.[field]) || f[field];
}

export function familyName(f, lang) {
  return (lang === 'en' && f.name_en) || f.name;
}
/** Nombre completo de un color: "Commercial 95 · White (7168)". */
export function colorLabel(ref, lang) {
  const hit = byRef.get(ref);
  if (!hit) return ref;
  return `${familyName(hit.family, lang)} · ${hit.color.name}${hit.family.generic ? '' : ` (${ref})`}`;
}
