// units.js — conversión entre el sistema interno (SI, siempre) y lo que se muestra.
// Cada magnitud tiene un "tipo"; toDisplay/toSI convierten y unit() da la etiqueta.

import { imperial, currencySymbol } from './market.js';

const KINDS = {
  len: { si: 'm', imp: 'ft', k: 3.28084 },
  area: { si: 'm²', imp: 'ft²', k: 10.7639 },
  U: { si: 'W/m²K', imp: 'Btu/h·ft²·°F', k: 1 / 5.678263 },
  irr: { si: 'W/m²', imp: 'Btu/h·ft²', k: 0.316998 },
  // Eficiencias: interno = kW frío / kW eléctrico; en EE. UU. SEER2 y HSPF2 en Btu/Wh.
  seer: { si: 'SEER', imp: 'SEER2', k: 3.412142 },
  hspf: { si: 'COP', imp: 'HSPF2', k: 3.412142 },
  power: { si: 'kW', imp: 'kBtu/h', k: 3.412142 },
  mm: { si: 'mm', imp: 'in', k: 1 / 25.4 },
  gsm: { si: 'g/m²', imp: 'oz/yd²', k: 0.0294935 },
  n5: { si: 'N/5 cm', imp: 'lbf/in', k: 0.1141959 },
  newton: { si: 'N', imp: 'lbf', k: 0.2248089 },
};

export function unit(kind) {
  if (kind === 'temp') return imperial() ? '°F' : '°C';
  if (kind === 'price') return `${currencySymbol()}/kWh`;
  const d = KINDS[kind];
  return imperial() ? d.imp : d.si;
}

export function toDisplay(kind, v) {
  if (kind === 'temp') return imperial() ? v * 9 / 5 + 32 : v;
  const d = KINDS[kind];
  return d && imperial() ? v * d.k : v;
}

export function toSI(kind, v) {
  if (kind === 'temp') return imperial() ? (v - 32) * 5 / 9 : v;
  const d = KINDS[kind];
  return d && imperial() ? v / d.k : v;
}

/** Rellena los <span data-unit="len"> con la unidad actual, entre paréntesis. */
export function applyUnits(root = document) {
  root.querySelectorAll('[data-unit]').forEach((el) => { el.textContent = `(${unit(el.dataset.unit)})`; });
}
