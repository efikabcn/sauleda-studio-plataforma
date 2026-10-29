// fabrics.js — adaptador: el módulo de velas lee las familias de uso "velas" del
// catálogo único (data/fabrics.json) con la misma forma que tenía en Shade Studio.
// El catálogo ya está cargado cuando se importa este módulo (app.js lo carga al arrancar).

import { families } from '../core/catalog.js';

const fams = families().filter((f) => f.uses.includes('velas'));
const first = fams[0];

/** Común a las calidades de velas, según ficha técnica. */
export const COMMON = {
  yarns: first.material,
  tempRange: first.tempRange,
  rollLength_m: first.rollLength_m,
  width_mm: first.roll_mm,
  certs: first.certs,
};

/** warp/weft = compensaciones de patronaje (%), estimadas hasta calibrar con una vela real. */
export const FABRICS = fams.map((f) => ({
  id: f.id, name: f.name, family: f.range,
  gsm: f.gsm, roll: f.roll_mm, thickness_mm: f.thickness_mm, warranty_y: f.warranty_y,
  construction: f.construction,
  tensile: f.mech.tensile, tear: f.mech.tear, burst: f.mech.burst, burstPressure: f.mech.burstPressure,
  flammability: f.fire,
  warp: f.patterning.warp, weft: f.patterning.weft, warpEstimated: f.patterning.estimated,
  dual: f.bicolor,
}));

/** Carta de color del artículo seleccionado. */
export function colorsFor(fabricId) {
  return (fams.find((f) => f.id === fabricId) || first).colors;
}

export const BRAND = {
  name: 'Sauleda',
  since: '1897',
  red: '#E11F1C',
  logo: 'assets/logo-sauleda.png',
  mark: 'assets/logo-s.png',
  site: 'www.sauleda.com',
  address: 'Travessera de les Corts, 102 · 08028 Barcelona',
  phone: '+34 933 397 150',
  email: 'sauleda@sauleda.com',
  appName: 'Sauleda Studio · Velas',
  tagline: 'diseño, visualización y patronaje de velas de sombra',
  claim: 'YOU LIVE, WE PROTECT',
};
