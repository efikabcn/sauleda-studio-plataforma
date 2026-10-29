// en52022.js — factor solar total vidrio + protección, método simplificado
// EN ISO 52022-1:2017 (antes EN 13363-1). Es el método que usan las fichas de
// producto y el que ES-SDA publica para los vidrios de referencia; ESBO usa el
// método detallado (EN ISO 52022-3, espectral), que da valores algo distintos.

/**
 * @param {object} p
 * @param {number} p.g   factor solar del vidrio
 * @param {number} p.U   transmitancia térmica del vidrio (W/m²K)
 * @param {number} p.Ts  transmitancia solar del tejido
 * @param {number} p.Rs  reflectancia solar del tejido
 * @param {'external'|'internal'} p.position
 * @returns {{gtot:number, Fc:number, As:number, warnings:string[]}}  warnings = claves de texto
 */
export function gtot({ g, U, Ts, Rs, position }) {
  const As = Math.max(0, 1 - Ts - Rs);
  const warnings = [];
  let gt;
  if (position === 'external') {
    const G1 = 5, G2 = 10;
    const G = 1 / (1 / G1 + 1 / G2 + 1 / U);
    gt = Ts * g + As * G / G2 + Ts * (1 - g) * G / G1;
  } else {
    const G2 = 30;
    const G = 1 / (1 / U + 1 / G2);
    gt = g * (1 - g * Rs - As * G / G2);
  }
  // Rango de aplicación del método simplificado (cláusula 1 de la norma).
  // Se devuelven claves de texto (strings.js: 'w.*'), no frases.
  if (Ts < 0 || Ts > 0.5) warnings.push('w.ts');
  if (Rs < 0.1 || Rs > 0.8) warnings.push('w.rs');
  if (g < 0.15 || g > 0.85) warnings.push('w.g');
  if (U < 0.7 || U > 3.0) warnings.push('w.u');
  if (Ts + Rs > 1) warnings.push('w.sum');
  return { gtot: Math.max(0, gt), Fc: g > 0 ? gt / g : 0, As, warnings };
}

/** Transmitancia luminosa conjunta (sin interreflexiones, conservador). */
export function tvTot(TvFabric, TvGlass) {
  return TvFabric * TvGlass;
}

/** Clase de confort térmico EN 14501 según gtot (0 = efecto muy pequeño … 4 = muy bueno). */
export function thermalClass(gt) {
  // label = clave de texto en strings.js
  if (gt >= 0.50) return { cls: 0, label: 'cls.0' };
  if (gt >= 0.35) return { cls: 1, label: 'cls.1' };
  if (gt >= 0.15) return { cls: 2, label: 'cls.2' };
  if (gt >= 0.10) return { cls: 3, label: 'cls.3' };
  return { cls: 4, label: 'cls.4' };
}
