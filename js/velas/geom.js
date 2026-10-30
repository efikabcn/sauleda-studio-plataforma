// geom.js — vectores, triangulación del sitio y curvas catenarias de borde.
// Todas las longitudes en milímetros internamente.
import { t } from '../core/i18n.js';

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  norm: (a) => { const l = V.len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  zero: () => [0, 0, 0],
};

export const LETTERS = 'ABCDEFGH'.split('');

/** Intersección de dos círculos en el plano. Devuelve las dos soluciones o null. */
export function circleIntersect(c0, r0, c1, r1) {
  const dx = c1[0] - c0[0], dy = c1[1] - c0[1];
  const d = Math.hypot(dx, dy);
  if (d === 0) return null;
  if (d > r0 + r1 + 1e-6) return null;          // demasiado lejos
  if (d < Math.abs(r0 - r1) - 1e-6) return null; // un círculo dentro del otro
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h2 = r0 * r0 - a * a;
  const h = Math.sqrt(Math.max(0, h2));
  const mx = c0[0] + (a * dx) / d, my = c0[1] + (a * dy) / d;
  const rx = (-dy * h) / d, ry = (dx * h) / d;
  return [[mx + rx, my + ry], [mx - rx, my - ry]];
}

/**
 * Reconstruye la planta a partir de medidas de cinta.
 *  edges[i]     = distancia del punto i al i+1 (cerrando el polígono)
 *  diagonals[k] = distancia del punto A (0) al punto k+2   (n-3 valores)
 *  heights[i]   = altura de cada anclaje sobre el punto más bajo
 *  mode 'plan'  = las medidas son proyecciones horizontales
 *  mode 'slope' = las medidas son distancias reales 3D entre anclajes
 */
export function solveSite({ n, edges, diagonals, heights, mode = 'plan' }) {
  const warnings = [];
  const dz = (i, j) => (heights[j] ?? 0) - (heights[i] ?? 0);
  const flat = (L, i, j) => {
    if (mode !== 'slope') return L;
    const d = dz(i, j);
    if (Math.abs(d) >= L) throw new Error(t('vj.errDrop', { e: `${LETTERS[i]}${LETTERS[j]}`, L, d: Math.abs(d) }));
    return Math.sqrt(L * L - d * d);
  };

  const E = edges.map((L, i) => flat(L, i, (i + 1) % n));
  const D = diagonals.map((L, k) => flat(L, 0, k + 2));

  const P = new Array(n);
  P[0] = [0, 0];
  P[1] = [E[0], 0];
  for (let k = 2; k < n; k++) {
    let sol;
    if (k === n - 1) {
      // el último punto se cierra contra A con la arista de cierre
      sol = circleIntersect(P[k - 1], E[k - 1], P[0], E[n - 1]);
      if (!sol) throw new Error(t('vj.errClose', { p: LETTERS[k], a: `${LETTERS[k - 1]}${LETTERS[k]}`, b: `${LETTERS[k]}A` }));
    } else {
      sol = circleIntersect(P[k - 1], E[k - 1], P[0], D[k - 2]);
      if (!sol) throw new Error(t('vj.errCross', { p: LETTERS[k], a: `${LETTERS[k - 1]}${LETTERS[k]}` }));
    }
    // se toma la solución que mantiene el polígono en sentido antihorario
    // (con y>0 hay empate en polígonos simétricos y salía el vértice reflejado)
    const cross = (q) => P[k - 1][0] * q[1] - P[k - 1][1] * q[0];
    P[k] = cross(sol[0]) > cross(sol[1]) ? sol[0] : sol[1];
  }

  const pts = P.map((p, i) => [p[0], p[1], heights[i] ?? 0]);

  // control de calidad: convexidad y ángulos muy cerrados
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]];
    if (u[0] * v[1] - u[1] * v[0] < 0) warnings.push(t('vj.concave', { p: LETTERS[i] }));
    const ang = Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]));
    if (Math.PI - ang < 0.17) warnings.push(t('vj.flatVertex', { p: LETTERS[i] }));
  }
  return { points: pts, planEdges: E, planDiagonals: D, warnings };
}

/** Centroide 3D de una lista de puntos. */
export function centroid(pts) {
  const s = pts.reduce((a, p) => V.add(a, p), V.zero());
  return V.mul(s, 1 / pts.length);
}

/** Área en planta (shoelace) de un polígono 3D proyectado en XY, en mm². */
export function planArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

/** Parámetro 'a' de una catenaria de cuerda L y flecha f (bisección). */
function catenaryA(L, f) {
  if (f <= 1e-6) return Infinity;
  let lo = 1e-3, hi = 1e9;
  const sag = (a) => a * Math.cosh(L / (2 * a)) - a;
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi);
    if (sag(mid) > f) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/**
 * Curva de borde entre P y Q, hundida hacia el interior (hacia `inwardRef`).
 * `ratio` es la flecha como fracción de la cuerda (0.08 = 8 %).
 * `shape` = 'catenary' (cable real) | 'parabola' (aproximación clásica CAD).
 */
export function edgeCurve(P, Q, inwardRef, ratio, samples = 24, shape = 'catenary') {
  const chord = V.sub(Q, P);
  const L = V.len(chord);
  const dir = V.mul(chord, 1 / L);
  const mid = V.lerp(P, Q, 0.5);
  let toIn = V.sub(inwardRef, mid);
  toIn = V.sub(toIn, V.mul(dir, V.dot(toIn, dir))); // componente perpendicular a la cuerda
  const inward = V.norm(toIn);
  const f = ratio * L;
  const a = shape === 'catenary' ? catenaryA(L, f) : Infinity;
  const depth = (t) => {
    const x = (t - 0.5) * L;
    if (shape === 'parabola' || !isFinite(a)) return 4 * f * t * (1 - t);
    return a * Math.cosh(L / (2 * a)) - a * Math.cosh(x / a);
  };
  const out = [];
  for (let s = 0; s <= samples; s++) {
    const t = s / samples;
    out.push(V.add(V.lerp(P, Q, t), V.mul(inward, depth(t))));
  }
  return out;
}

/** Longitud de una polilínea 3D. */
export function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += V.dist(pts[i - 1], pts[i]);
  return L;
}

/** Remuestrea una polilínea a `count` puntos equiespaciados en longitud de arco. */
export function resample(pts, count) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + V.dist(pts[i - 1], pts[i]));
  const total = acc[acc.length - 1];
  const out = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1);
    while (j < acc.length - 2 && acc[j + 1] < target) j++;
    const seg = acc[j + 1] - acc[j] || 1;
    out.push(V.lerp(pts[j], pts[j + 1], (target - acc[j]) / seg));
  }
  return out;
}
