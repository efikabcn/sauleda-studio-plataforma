// params.js — parámetros del cálculo solar: vidrios, tipos de protección, usos,
// inercia y husos horarios. Los tejidos vienen del catálogo único (core/catalog.js).

/** Vidrios de referencia (EN 14501 / EN 410). g = factor solar, U en W/m²K. */
export const GLAZINGS = [
  { id: 'A', name: { es: 'Monolítico 4 mm (ref. A)', en: 'Single 4 mm (ref. A)' }, g: 0.85, U: 5.8, Tv: 0.90 },
  { id: 'B', name: { es: 'Doble 4/16/4 aire (ref. B)', en: 'Double 4/16/4 air (ref. B)' }, g: 0.76, U: 2.9, Tv: 0.82 },
  { id: 'C', name: { es: 'Doble bajo emisivo, argón (ref. C)', en: 'Double low-e, argon (ref. C)' }, g: 0.59, U: 1.2, Tv: 0.80 },
  { id: 'D', name: { es: 'Doble control solar (ref. D)', en: 'Double solar control (ref. D)' }, g: 0.32, U: 1.1, Tv: 0.60 },
  { id: 'T', name: { es: 'Triple bajo emisivo', en: 'Triple low-e' }, g: 0.50, U: 0.7, Tv: 0.70 },
];

/** Tipos de protección. position = posición respecto al vidrio para EN ISO 52022-1. */
export const SHADE_TYPES = [
  { id: 'vertical', position: 'external',
    name: { es: 'Exterior vertical (screen, toldo vertical, cofre)', en: 'Exterior vertical (screen, drop awning)' },
    short: { es: 'una protección exterior vertical', en: 'an exterior vertical shade' } },
  { id: 'brazos', position: 'external',
    name: { es: 'Toldo de brazos extensibles', en: 'Folding-arm awning' },
    short: { es: 'un toldo de brazos', en: 'a folding-arm awning' } },
  { id: 'interior', position: 'internal',
    name: { es: 'Estor enrollable interior', en: 'Interior roller shade' },
    short: { es: 'un estor interior', en: 'an interior roller shade' } },
];

/** Perfiles de uso: ganancias internas (W/m²), horario ocupado y consignas. */
export const USES = {
  vivienda: { name: { es: 'Vivienda', en: 'Residential' }, gains: 4.2, occ: [0, 24], weekdays: false, heat: 20, cool: 26, hvacAlways: true },
  oficina: { name: { es: 'Oficina', en: 'Office' }, gains: 15, occ: [8, 19], weekdays: true, heat: 21, cool: 25, hvacAlways: false },
  comercio: { name: { es: 'Comercio / restauración', en: 'Retail / restaurant' }, gains: 20, occ: [9, 21], weekdays: false, heat: 20, cool: 25, hvacAlways: false },
};

export const INERTIA = {
  ligera: { name: { es: 'Ligera (tabiquería seca)', en: 'Light (drywall)' }, Am: 2.5, Cm: 80000 },
  media: { name: { es: 'Media', en: 'Medium' }, Am: 2.5, Cm: 165000 },
  pesada: { name: { es: 'Pesada (fábrica, hormigón)', en: 'Heavy (masonry, concrete)' }, Am: 3.0, Cm: 260000 },
};

/** Huso horario estándar (h respecto a UTC) y si aplica horario de verano europeo/EE. UU. */
export const CITY_TZ = {
  laspalmas: [0, 'eu'], lisboa: [0, 'eu'], atenas: [2, 'eu'],
  miami: [-5, 'us'], orlando: [-5, 'us'], tampa: [-5, 'us'], atlanta: [-5, 'us'], newyork: [-5, 'us'], washington: [-5, 'us'],
  chicago: [-6, 'us'], houston: [-6, 'us'], dallas: [-6, 'us'],
  phoenix: [-7, 'none'],   // Arizona no cambia de hora
  lasvegas: [-8, 'us'], losangeles: [-8, 'us'], sandiego: [-8, 'us'],
};
export const DEFAULT_TZ = [1, 'eu'];

export const ORIENTATIONS = [
  [{ es: 'N', en: 'N' }, 0], [{ es: 'NE', en: 'NE' }, 45], [{ es: 'E', en: 'E' }, 90], [{ es: 'SE', en: 'SE' }, 135],
  [{ es: 'S', en: 'S' }, 180], [{ es: 'SO', en: 'SW' }, 225], [{ es: 'O', en: 'W' }, 270], [{ es: 'NO', en: 'NW' }, 315],
];
