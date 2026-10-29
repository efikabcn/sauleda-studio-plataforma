// membrane.js — contorno de tela, malla de la superficie y relajación de fuerza-densidad.
import { V, centroid, edgeCurve, polylineLength } from './geom.js';

/**
 * Puntos de tela: cada esquina se retranquea hacia dentro por la deducción de
 * herrajes (tensor + grillete + guardacabo) a lo largo de la bisectriz.
 */
export function fabricCorners(fixings, deductions) {
  const c = centroid(fixings);
  const n = fixings.length;
  return fixings.map((p, i) => {
    const prev = fixings[(i - 1 + n) % n], next = fixings[(i + 1) % n];
    const b = V.norm(V.add(V.norm(V.sub(prev, p)), V.norm(V.sub(next, p))));
    const bis = V.len(b) < 1e-6 ? V.norm(V.sub(c, p)) : b;
    const dir = V.dot(bis, V.sub(c, p)) < 0 ? V.mul(bis, -1) : bis;
    return V.add(p, V.mul(dir, deductions[i] ?? 0));
  });
}

/** Contorno completo de la tela: catenarias por lado + índices de esquina. */
export function buildBoundary(corners, curveRatios, shape = 'catenary', perSide = 26) {
  const c = centroid(corners);
  const n = corners.length;
  const loop = [];
  const cornerIdx = [];
  const edgeLengths = [];
  for (let i = 0; i < n; i++) {
    const P = corners[i], Q = corners[(i + 1) % n];
    const curve = edgeCurve(P, Q, c, curveRatios[i] ?? 0.08, perSide, shape);
    edgeLengths.push(polylineLength(curve));
    cornerIdx.push(loop.length);
    for (let k = 0; k < curve.length - 1; k++) loop.push(curve[k]); // el último lo aporta el lado siguiente
  }
  return { loop, cornerIdx, edgeLengths };
}

/**
 * Malla polar con densidad decreciente hacia el centro (triángulos casi
 * equiláteros, sin singularidad) + relajación de fuerza-densidad q = 1/L:
 * el resultado es la superficie de mínima energía de la membrana tensada.
 */
export function relaxSurface(boundaryLoop, { rings = 0, passes = 20, iters = 20 } = {}) {
  const B = boundaryLoop.length;
  const M = rings || Math.max(5, Math.min(22, Math.round(B / 6.283)));
  const c = centroid(boundaryLoop);

  // punto del contorno para un parámetro t en [0,1)
  const at = (t) => {
    const x = ((t % 1) + 1) % 1 * B;
    const i = Math.floor(x), f = x - i;
    return V.lerp(boundaryLoop[i % B], boundaryLoop[(i + 1) % B], f);
  };

  const verts = [c];              // 0 = centro
  const ringIdx = [[0]];
  for (let j = 1; j <= M; j++) {
    const nj = j === M ? B : Math.max(6, Math.round((B * j) / M));
    const ids = [];
    for (let i = 0; i < nj; i++) {
      const t = i / nj;
      ids.push(verts.length);
      verts.push(j === M ? boundaryLoop[i] : V.lerp(c, at(t), j / M));
    }
    ringIdx.push(ids);
  }

  // triangulación: abanico central + cremallera entre anillos consecutivos
  const tris = [];
  const r1 = ringIdx[1];
  for (let i = 0; i < r1.length; i++) tris.push([0, r1[i], r1[(i + 1) % r1.length]]);
  for (let j = 1; j < M; j++) {
    const A = ringIdx[j], Bo = ringIdx[j + 1];
    const m = A.length, n = Bo.length;
    let i = 0, k = 0;
    while (i < m || k < n) {
      const nextI = (i + 1) / m, nextK = (k + 1) / n;
      if (i < m && (k >= n || nextI <= nextK)) {
        tris.push([A[i % m], Bo[k % n], A[(i + 1) % m]]); i++;
      } else {
        tris.push([A[i % m], Bo[k % n], Bo[(k + 1) % n]]); k++;
      }
    }
  }

  // adyacencia y relajación (contorno fijo)
  const adj = verts.map(() => new Set());
  for (const [a, b, cc] of tris) {
    adj[a].add(b); adj[b].add(a); adj[b].add(cc); adj[cc].add(b); adj[cc].add(a); adj[a].add(cc);
  }
  const fixed = new Set(ringIdx[M]);
  const nbrs = adj.map((s) => [...s]);
  for (let p = 0; p < passes; p++) {
    for (let it = 0; it < iters; it++) {
      for (let v = 0; v < verts.length; v++) {
        if (fixed.has(v)) continue;
        let sw = 0, acc = [0, 0, 0];
        for (const q of nbrs[v]) {
          const w = 1 / (V.dist(verts[v], verts[q]) || 1);   // fuerza-densidad
          sw += w; acc = V.add(acc, V.mul(verts[q], w));
        }
        if (sw > 0) verts[v] = V.mul(acc, 1 / sw);
      }
    }
  }
  return { verts, tris, rings: M, ringSize: B, boundaryIndex: (i) => ringIdx[M][i % B] };
}

/** Área real de la superficie (mm²). */
export function surfaceArea(mesh) {
  let a = 0;
  for (const [i, j, k] of mesh.tris) {
    const u = V.sub(mesh.verts[j], mesh.verts[i]);
    const v = V.sub(mesh.verts[k], mesh.verts[i]);
    a += V.len(V.cross(u, v)) / 2;
  }
  return a;
}
