// sun.js — posición solar (algoritmo NOAA) y proyección de sombras.

const rad = Math.PI / 180, deg = 180 / Math.PI;

function julianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Azimut (0=N, 90=E) y altura solar en grados para una fecha UTC y lat/lon. */
export function sunPosition(date, lat, lon) {
  const jd = julianDay(date);
  const n = jd - 2451545.0;
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = ((gmst * 15 + lon) % 360) * rad;
  const H = lst - ra;
  const la = lat * rad;
  const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
  let az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(la) - Math.tan(dec) * Math.cos(la));
  az = (az * deg + 180) % 360;
  return { azimuth: az, altitude: alt * deg };
}

/** Vector unitario hacia el sol en el sistema del modelo (x=E, y=N, z=arriba). */
export function sunVector(azimuthDeg, altitudeDeg, northOffsetDeg = 0) {
  const a = (azimuthDeg - northOffsetDeg) * rad, h = altitudeDeg * rad;
  return [Math.cos(h) * Math.sin(a), Math.cos(h) * Math.cos(a), Math.sin(h)];
}

/** Orto y ocaso aproximados (hora local decimal) para el día dado. */
export function dayLength(date, lat, lon) {
  const out = [];
  for (let m = 0; m < 1440; m += 10) {
    const d = new Date(date); d.setHours(0, m, 0, 0);
    out.push({ m, alt: sunPosition(d, lat, lon).altitude });
  }
  let rise = null, set = null;
  for (let i = 1; i < out.length; i++) {
    if (out[i - 1].alt < 0 && out[i].alt >= 0) rise = out[i].m;
    if (out[i - 1].alt >= 0 && out[i].alt < 0) set = out[i].m;
  }
  return { rise, set };
}

/** Proyecta un punto sobre el plano z=0 siguiendo la dirección del sol. */
export function projectShadow(p, sunVec) {
  if (sunVec[2] <= 0.02) return null;
  const t = p[2] / sunVec[2];
  return [p[0] - sunVec[0] * t, p[1] - sunVec[1] * t, 0];
}
