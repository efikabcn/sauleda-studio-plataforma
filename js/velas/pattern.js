// pattern.js — despiece en paños, desarrollo 3D->2D, compensaciones y anidado.
import { V } from './geom.js';

/* ---------------- recorte de la malla por planos verticales ---------------- */

function polyClip(poly, val, keepGreater, ax) {
  // Sutherland-Hodgman contra el plano u = val (u = proyección sobre ax)
  const u = (p) => p[0] * ax[0] + p[1] * ax[1];
  const inside = (p) => (keepGreater ? u(p) >= val - 1e-9 : u(p) <= val + 1e-9);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (val - u(a)) / (u(b) - u(a));
      out.push(V.lerp(a, b, t));
    }
  }
  return out;
}

/** Divide la malla en bandas paralelas a `ax` situadas en los cortes `cuts`. */
export function sliceIntoPanels(mesh, ax, cuts, snap = 6) {
  // se pegan al plano de corte los vértices que caen casi encima: evita astillas
  const verts = mesh.verts.map((p) => {
    const u = p[0] * ax[0] + p[1] * ax[1];
    for (const c of cuts) {
      if (Math.abs(u - c) < snap) return [p[0] + (c - u) * ax[0], p[1] + (c - u) * ax[1], p[2]];
    }
    return p;
  });
  mesh = { ...mesh, verts };
  const bands = [];
  const bounds = [-Infinity, ...cuts, Infinity];
  for (let b = 0; b < bounds.length - 1; b++) bands.push({ tris: [], lo: bounds[b], hi: bounds[b + 1] });
  const u = (p) => p[0] * ax[0] + p[1] * ax[1];
  for (const t of mesh.tris) {
    const P = t.map((i) => mesh.verts[i]);
    const uu = P.map(u);
    const lo = Math.min(...uu), hi = Math.max(...uu);
    for (let b = 0; b < bands.length; b++) {
      const band = bands[b];
      if (hi <= band.lo || lo >= band.hi) continue;
      let poly = P;
      if (isFinite(band.lo)) poly = polyClip(poly, band.lo, true, ax);
      if (poly.length && isFinite(band.hi)) poly = polyClip(poly, band.hi, false, ax);
      if (poly.length < 3) continue;
      for (let k = 1; k < poly.length - 1; k++) band.tris.push([poly[0], poly[k], poly[k + 1]]);
    }
  }
  return bands.filter((b) => b.tris.length);
}

/** Malla indexada: fusiona vértices a menos de `tol` y descarta degenerados. */
export function weld(tris, tol = 1.0, minArea = 2.0) {
  const cell = tol > 0 ? tol : 1;
  const grid = new Map(), verts = [], out = [];
  const key = (a, b, c) => a + ',' + b + ',' + c;
  const findOrAdd = (p) => {
    const gx = Math.floor(p[0] / cell), gy = Math.floor(p[1] / cell), gz = Math.floor(p[2] / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const bucket = grid.get(key(gx + dx, gy + dy, gz + dz));
      if (!bucket) continue;
      for (const i of bucket) if (V.dist(verts[i], p) <= tol) return i;
    }
    const id = verts.length;
    verts.push(p);
    const k = key(gx, gy, gz);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(id);
    return id;
  };
  for (const t of tris) {
    const idx = t.map(findOrAdd);
    if (idx[0] === idx[1] || idx[1] === idx[2] || idx[0] === idx[2]) continue;
    const [A, B, C] = idx.map((i) => verts[i]);
    if (V.len(V.cross(V.sub(B, A), V.sub(C, A))) / 2 < minArea) continue;
    out.push(idx);
  }
  return { verts, tris: out };
}

/** Longitud media de arista de una malla (escala característica). */
export function meanEdge(mesh) {
  let sum = 0, n = 0;
  for (const [a, b, c] of mesh.tris) {
    sum += V.dist(mesh.verts[a], mesh.verts[b]) + V.dist(mesh.verts[b], mesh.verts[c]) + V.dist(mesh.verts[c], mesh.verts[a]);
    n += 3;
  }
  return n ? sum / n : 1;
}

/* ---------------------------- desarrollo 3D -> 2D --------------------------- */

function trilaterate2D(a, b, ra, rb, sign) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const d = Math.hypot(dx, dy) || 1e-9;
  const x = (d * d + ra * ra - rb * rb) / (2 * d);
  const y = Math.sqrt(Math.max(0, ra * ra - x * x));
  const ux = dx / d, uy = dy / d;
  return [a[0] + ux * x - uy * y * sign, a[1] + uy * x + ux * y * sign];
}

/**
 * Aplana un parche triangulado minimizando la distorsión de longitudes:
 * despliegue BFS como semilla + relajación de mínimos cuadrados sobre las aristas.
 */
export function flattenPatch(sub, { iters = 400 } = {}) {
  const { verts, tris } = sub;
  const N = verts.length;
  const pos = new Array(N).fill(null);

  // semilla: primer triángulo, orientación positiva
  const seed = tris[0];
  pos[seed[0]] = [0, 0];
  pos[seed[1]] = [V.dist(verts[seed[0]], verts[seed[1]]), 0];
  pos[seed[2]] = trilaterate2D(pos[seed[0]], pos[seed[1]], V.dist(verts[seed[0]], verts[seed[2]]), V.dist(verts[seed[1]], verts[seed[2]]), 1);

  // barridos hasta que no se pueda colocar nada más: cada triángulo con dos
  // vértices ya situados fija el tercero por trilateración conservando el giro.
  const done = new Array(tris.length).fill(false);
  done[0] = true;
  let progress = true, guard = 0;
  while (progress && guard++ < 200) {
    progress = false;
    for (let ti = 0; ti < tris.length; ti++) {
      if (done[ti]) continue;
      const t = tris[ti];
      const missing = t.map((v, k) => (pos[v] ? -1 : k)).filter((k) => k >= 0);
      if (missing.length === 0) { done[ti] = true; progress = true; continue; }
      if (missing.length > 1) continue;
      const m = missing[0];
      const a = t[(m + 1) % 3], b = t[(m + 2) % 3], c = t[m];
      pos[c] = trilaterate2D(pos[a], pos[b], V.dist(verts[a], verts[c]), V.dist(verts[b], verts[c]), 1);
      done[ti] = true; progress = true;
    }
  }
  // se descartan los triángulos que hayan quedado sueltos (islas)
  const live = tris.filter((t, i) => done[i] && t.every((v) => pos[v]));

  // aristas y contorno sobre la parte efectivamente desplegada
  const edgeMap = new Map();
  const ekey = (a, b) => (a < b ? a + '_' + b : b + '_' + a);
  live.forEach((t) => {
    for (let e = 0; e < 3; e++) {
      const k = ekey(t[e], t[(e + 1) % 3]);
      edgeMap.set(k, (edgeMap.get(k) || 0) + 1);
    }
  });
  const edges = [];
  for (const [k, cnt] of edgeMap) {
    const [a, b] = k.split('_').map(Number);
    edges.push([a, b, V.dist(verts[a], verts[b]), cnt === 1 ? 1.4 : 1]);
  }

  // relajación: cada arista tira hacia su longitud real en 3D (mínimos cuadrados)
  for (let it = 0; it < iters; it++) {
    for (const [a, b, L, w] of edges) {
      const dx = pos[b][0] - pos[a][0], dy = pos[b][1] - pos[a][1];
      const d = Math.hypot(dx, dy) || 1e-9;
      const corr = Math.max(-0.4, Math.min(0.4, ((d - L) / d) * 0.25 * w));
      pos[a][0] += dx * corr; pos[a][1] += dy * corr;
      pos[b][0] -= dx * corr; pos[b][1] -= dy * corr;
    }
  }

  const loop = borderLoop(live, pos);

  let maxErr = 0, wsum = 0, esum = 0;
  for (const [a, b, L] of edges) {
    if (L < 30) continue;                     // aristas residuales del recorte
    const d = Math.hypot(pos[b][0] - pos[a][0], pos[b][1] - pos[a][1]);
    const e = Math.abs(d - L) / L;
    maxErr = Math.max(maxErr, e);
    esum += e * L; wsum += L;
  }
  return { pos, loop, verts3: verts, tris: live, maxErr, avgErr: wsum ? esum / wsum : 0 };
}

/**
 * Contorno del parche recorrido por aristas dirigidas: usa el giro coherente de
 * los triángulos, de modo que un pellizco en la malla no descarrila el recorrido.
 * Si aparece más de un lazo se queda con el de mayor área.
 */
function borderLoop(tris, pos) {
  const dir = new Set();
  const key = (a, b) => a + '>' + b;
  for (const t of tris) for (let e = 0; e < 3; e++) dir.add(key(t[e], t[(e + 1) % 3]));
  const next = new Map();
  for (const d of dir) {
    const [a, b] = d.split('>').map(Number);
    if (dir.has(key(b, a))) continue;           // arista interior
    if (!next.has(a)) next.set(a, []);
    next.get(a).push(b);
  }
  const loops = [];
  for (const [start] of next) {
    while ((next.get(start) || []).length) {      // se consumen las aristas dirigidas
      const loop = [];
      let cur = start;
      for (let guard = 0; guard < 200000; guard++) {
        const outs = next.get(cur);
        if (!outs || !outs.length) break;
        loop.push(cur);
        cur = outs.shift();
        if (cur === start) break;
      }
      if (loop.length > 2) loops.push(loop);
      else break;
    }
  }
  if (!loops.length) return [];
  const area = (l) => {
    let a = 0;
    for (let i = 0; i < l.length; i++) {
      const p = pos[l[i]], q = pos[l[(i + 1) % l.length]];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
  };
  return loops.reduce((best, l) => (area(l) > area(best) ? l : best), loops[0]);
}

/* ------------------------- compensación y márgenes ------------------------- */

/** Ejes principales del paño (largo = urdimbre por defecto) por PCA del contorno. */
export function panelAxes(pts) {
  const c = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]).map((v) => v / pts.length);
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { const x = p[0] - c[0], y = p[1] - c[1]; sxx += x * x; sxy += x * y; syy += y * y; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { c, long: [Math.cos(th), Math.sin(th)], cross: [-Math.sin(th), Math.cos(th)] };
}

/** Compensación biaxial genérica (la ruta principal la aplica en el marco del paño). */
export function compensate(pts, axes, warpPct, weftPct) {
  const kw = 1 / (1 + warpPct / 100), kf = 1 / (1 + weftPct / 100);
  return pts.map((p) => {
    const d = [p[0] - axes.c[0], p[1] - axes.c[1]];
    const a = d[0] * axes.long[0] + d[1] * axes.long[1];
    const b = d[0] * axes.cross[0] + d[1] * axes.cross[1];
    const a2 = a * kw, b2 = b * kf;
    return [axes.c[0] + a2 * axes.long[0] + b2 * axes.cross[0], axes.c[1] + a2 * axes.long[1] + b2 * axes.cross[1]];
  });
}

/** Offset exterior de un polígono con margen variable por arista. */
export function offsetPolygon(pts, margins) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  // orientación: aseguramos sentido antihorario para que la normal salga fuera
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const s = area >= 0 ? 1 : -1;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const d = [b[0] - a[0], b[1] - a[1]];
    const L = Math.hypot(d[0], d[1]) || 1e-9;
    const nrm = [(d[1] / L) * s, (-d[0] / L) * s]; // normal exterior
    const m = margins[i] ?? 0;
    lines.push({ p: [a[0] + nrm[0] * m, a[1] + nrm[1] * m], d: [d[0] / L, d[1] / L] });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const l1 = lines[(i - 1 + n) % n], l2 = lines[i];
    const den = l1.d[0] * l2.d[1] - l1.d[1] * l2.d[0];
    if (Math.abs(den) < 1e-7) { out.push(l2.p); continue; }
    const t = ((l2.p[0] - l1.p[0]) * l2.d[1] - (l2.p[1] - l1.p[1]) * l2.d[0]) / den;
    out.push([l1.p[0] + l1.d[0] * t, l1.p[1] + l1.d[1] * t]);
  }
  return out;
}

/* --------------------------------- anidado -------------------------------- */

/** Perfil inferior/superior del polígono por columnas (rasterizado vertical). */
function profiles(pts, bb, col) {
  const nc = Math.max(1, Math.ceil(bb.w / col));
  const lower = new Array(nc).fill(Infinity), upper = new Array(nc).fill(-Infinity);
  for (let k = 0; k < nc; k++) {
    const xc = bb.min[0] + (k + 0.5) * col;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[0] <= xc && b[0] > xc) || (b[0] <= xc && a[0] > xc)) {
        const t = (xc - a[0]) / (b[0] - a[0]);
        const y = a[1] + (b[1] - a[1]) * t;
        lower[k] = Math.min(lower[k], y); upper[k] = Math.max(upper[k], y);
      }
    }
  }
  return { lower, upper, nc };
}

/**
 * Anidado sobre el rollo (ancho fijo, largo libre) con perfiles reales:
 * bottom-left-fill con giro de 180°, de modo que los paños cónicos encajen
 * unos dentro de otros como en una mesa de corte real.
 */
export function nest(panels, rollWidth, gap = 30, { col = 20, xstep = 40, allowFlip = true } = {}) {
  const ncols = Math.max(1, Math.floor(rollWidth / col));
  const sky = new Array(ncols).fill(gap);
  const order = panels.map((_, i) => i).sort((a, b) => bbox(panels[b].cut).w - bbox(panels[a].cut).w);
  const placed = new Array(panels.length);
  const warnings = [];

  for (const i of order) {
    const p = panels[i];
    let best = null;
    for (const flip of allowFlip ? [0, 1] : [0]) {
      const pts = flip ? p.cut.map((q) => [-q[0], -q[1]]) : p.cut;
      const bb = bbox(pts);
      if (bb.w + 2 * gap > rollWidth) {
        if (!flip) warnings.push(`El paño ${p.label} mide ${Math.round(bb.w)} mm de ancho y no cabe en un rollo de ${rollWidth} mm.`);
        continue;
      }
      const { lower, upper, nc } = profiles(pts, bb, col);
      const maxX = rollWidth - bb.w - gap;
      for (let x = gap; x <= Math.max(gap, maxX); x += xstep) {
        const c0 = Math.floor(x / col);
        let dy = 0;
        for (let k = 0; k < nc; k++) {
          const cc = c0 + k;
          if (cc < 0 || cc >= ncols || !isFinite(lower[k])) continue;
          dy = Math.max(dy, sky[cc] + gap - (bb.min[1] + (lower[k] - bb.min[1])));
        }
        let top = -Infinity;
        for (let k = 0; k < nc; k++) if (isFinite(upper[k])) top = Math.max(top, upper[k] + dy);
        const score = top * 10000 + x;
        if (!best || score < best.score) best = { score, x, dy, flip, pts, bb, lower, upper, nc, c0, top };
      }
    }
    if (!best) {   // no cabe: se apila igualmente para no perderlo del plano de corte
      const bb = bbox(p.cut);
      const dy = Math.max(...sky) + gap - bb.min[1], dx = gap - bb.min[0];
      sky.fill(bb.h + dy + gap);
      placed[i] = { ...p, nestCut: p.cut.map((q) => [q[0] + dx, q[1] + dy]), nestNet: p.net.map((q) => [q[0] + dx, q[1] + dy]), offset: [dx, dy], flip: 0, oversize: true };
      continue;
    }
    const dx = best.x - best.bb.min[0], dy = best.dy;
    for (let k = 0; k < best.nc; k++) {
      const cc = best.c0 + k;
      if (cc < 0 || cc >= ncols || !isFinite(best.upper[k])) continue;
      sky[cc] = Math.max(sky[cc], best.upper[k] + dy);
    }
    const tf = (q) => (best.flip ? [-q[0] + dx, -q[1] + dy] : [q[0] + dx, q[1] + dy]);
    placed[i] = { ...p, nestCut: best.pts.map((q) => [q[0] + dx, q[1] + dy]), nestNet: p.net.map(tf), offset: [dx, dy], flip: best.flip };
  }
  const rollLength = Math.max(...sky) + gap;
  return { placed, rollLength, warnings };
}

export function bbox(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const min = [Math.min(...xs), Math.min(...ys)], max = [Math.max(...xs), Math.max(...ys)];
  return { min, max, w: max[0] - min[0], h: max[1] - min[1] };
}

export function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
}
