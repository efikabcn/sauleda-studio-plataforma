// sail.js — orquestador: de las medidas de obra al patrón de corte.
import { V, solveSite, centroid, planArea, LETTERS } from './geom.js';
import { FABRICS, COMMON } from './fabrics.js';
import { fabricCorners, buildBoundary, relaxSurface, surfaceArea } from './membrane.js';
import { sliceIntoPanels, weld, flattenPatch, panelAxes, offsetPolygon, nest, bbox, polyArea } from './pattern.js';
import { t } from '../core/i18n.js';

export { FABRICS };

export const PRETENSION = { low: 0.6, std: 1.0, high: 1.6 };

/** Ángulo (rad) de la dirección de las costuras según la estrategia elegida. */
function seamAngle(layout, corners) {
  const n = corners.length;
  const edgeAng = (i) => {
    const a = corners[i], b = corners[(i + 1) % n];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  const edgeLen = (i) => V.dist(corners[i], corners[(i + 1) % n]);
  switch (layout) {
    case 'longest': {
      let best = 0;
      for (let i = 1; i < n; i++) if (edgeLen(i) > edgeLen(best)) best = i;
      return edgeAng(best) + Math.PI / 2;
    }
    case 'parallelAB': return edgeAng(0) + Math.PI / 2;
    case 'parallelBC': return edgeAng(1) + Math.PI / 2;
    case 'cross': return edgeAng(0);
    case 'hypar': {   // costuras siguiendo la torsión: perpendicular al eje alto-alto
      let hi = 0, lo = 0;
      corners.forEach((p, i) => { if (p[2] > corners[hi][2]) hi = i; if (p[2] < corners[lo][2]) lo = i; });
      const d = V.sub(corners[hi], corners[lo]);
      return Math.atan2(d[1], d[0]) + Math.PI / 2;
    }
    default: {        // auto: minimiza el número de paños => perpendicular al lado más largo
      let best = 0;
      for (let i = 1; i < n; i++) if (edgeLen(i) > edgeLen(best)) best = i;
      return edgeAng(best) + Math.PI / 2;
    }
  }
}

export function computeSail(spec) {
  const notes = [];
  const site = solveSite(spec);
  notes.push(...site.warnings);
  const fixings = site.points;

  const corners = fabricCorners(fixings, spec.hardware);
  const boundary = buildBoundary(corners, spec.curves, spec.curveShape || 'catenary');
  const fast = spec.quality === 'fast';
  const mesh = relaxSurface(boundary.loop, { rings: fast ? 10 : 14, passes: fast ? 10 : 20, iters: 20 });
  const areaSurf = surfaceArea(mesh);
  const areaPlan = planArea(boundary.loop);

  const fabric = FABRICS.find((f) => f.id === spec.fabricId) || FABRICS[0];
  const rollWidth = spec.rollWidth || fabric.roll;
  const pre = PRETENSION[spec.pretension] ?? 1;
  const warpPct = spec.warpPct != null ? spec.warpPct : fabric.warp * pre;
  const weftPct = spec.weftPct != null ? spec.weftPct : fabric.weft * pre;
  const usable = rollWidth - 2 * spec.seam;
  if (usable <= 200) throw new Error(t('vj.errUsable'));
  const curveFactor = Math.sqrt(areaSurf / Math.max(areaPlan, 1));
  const tolDist = spec.maxDistortion ?? 0.015;   // 1,5 % de error de desarrollo admisible
  // escala característica = separación entre puntos del contorno (la parte más fina
  // de la malla). Marca las tolerancias de soldadura y recorte de la malla.
  const edgeScale = boundary.edgeLengths.reduce((a, b) => a + b, 0) / boundary.loop.length;

  /** Despiece + anidado para una dirección de costura dada. */
  const layoutFor = (th, quick = false) => {
    const ax = [Math.cos(th), Math.sin(th)];
    const us = boundary.loop.map((p) => p[0] * ax[0] + p[1] * ax[1]);
    const uMin = Math.min(...us), span = Math.max(...us) - uMin;
    let count = Math.max(1, Math.ceil((span * curveFactor) / usable));
    let panels = null, cuts = null, best = null;
    const gap = spec.nestGap ?? 30, room = rollWidth - 2 * gap;
    const maxCount = Math.ceil((span * curveFactor * 2) / usable) + 2;
    for (let attempt = 0; attempt < 5; attempt++) {
      cuts = [];
      for (let k = 1; k < count; k++) cuts.push(uMin + (span * k) / count);
      panels = buildPanels(mesh, ax, cuts, { ...spec, quality: quick ? 'fast' : spec.quality }, { warpPct, weftPct, h: edgeScale });
      const widest = Math.max(...panels.map((p) => p.cutWidth));
      const worst = Math.max(...panels.map((p) => p.maxErr));
      if (widest <= room && (!best || worst < best.worst)) best = { panels, cuts, worst };
      if (widest <= room && worst <= tolDist) { best = { panels, cuts, worst }; break; }
      if (count >= maxCount) break;
      count = widest <= room ? count + 1
        : Math.min(maxCount, Math.max(count + 1, Math.ceil(count * (widest / room))));
    }
    if (best) { panels = best.panels; cuts = best.cuts; }
    const nested = nest(panels, rollWidth, spec.nestGap ?? 30, quick ? { xstep: 80, col: 40 } : {});
    return { th, ax, cuts, panels, nested };
  };

  let layout;
  if (spec.panelLayout === 'optimo' || spec.panelLayout == null) {
    const cands = [];
    for (let deg = 0; deg < 180; deg += 15) {
      try {
        const cand = layoutFor((deg * Math.PI) / 180, true);
        if (cand.nested.warnings.length) continue;          // no cabe en el rollo
        const worst = Math.max(...cand.panels.map((p) => p.maxErr));
        cands.push({ deg, cost: cand.nested.rollLength, worst });
      } catch (e) { /* dirección inviable */ }
    }
    if (!cands.length) throw new Error(t('vj.errNoDir'));
    const ok = cands.filter((c) => c.worst <= tolDist * 2);
    let pool = ok;
    if (!pool.length) {           // ninguna dirección da un patrón plano: se avisa y se usa la mejor
      pool = cands.slice().sort((a, b) => a.worst - b.worst).slice(0, 3);
      notes.push(t('vj.noFlat'));
    }
    pool.sort((a, b) => a.cost - b.cost);
    cands.length = 0; cands.push(...pool);
    // los mejores candidatos se reevalúan a calidad completa: la malla fina
    // puede cambiar el número de paños y, con él, el consumo real.
    let best = null;
    for (const c of cands.slice(0, 3)) {
      for (const d of [c.deg, c.deg + 7]) {
        try {
          const full = layoutFor((d * Math.PI) / 180);
          if (full.nested.warnings.length) continue;
          if (!best || full.nested.rollLength < best.nested.rollLength) best = full;
        } catch (e) { /* nada */ }
      }
    }
    if (!best) throw new Error(t('vj.errNoDir'));
    layout = best;
    notes.push(t('vj.optDir', { a: (((layout.th * 180) / Math.PI + 360) % 180).toFixed(0), m: (layout.nested.rollLength / 1000).toFixed(2) }));
  } else {
    layout = layoutFor(spec.seamAngle != null ? spec.seamAngle : seamAngle(spec.panelLayout, corners));
  }

  const { panels, nested, ax, cuts, th } = layout;
  const fabricArea = (nested.rollLength * rollWidth) / 1e6;
  const panelArea = panels.reduce((a, p) => a + polyArea(p.cut), 0) / 1e6;
  notes.push(...(nested.warnings || []));

  const metrics = {
    areaPlan_m2: areaPlan / 1e6,
    areaSurface_m2: areaSurf / 1e6,
    perimeter_mm: boundary.edgeLengths.reduce((a, b) => a + b, 0),
    edgeLengths: boundary.edgeLengths,
    edgeChords: corners.map((p, i) => V.dist(p, corners[(i + 1) % corners.length])),
    fixingSpans: fixings.map((p, i) => V.dist(p, fixings[(i + 1) % fixings.length])),
    fixingSpansPlan: fixings.map((p, i) => {
      const q = fixings[(i + 1) % fixings.length];
      return Math.hypot(q[0] - p[0], q[1] - p[1]);
    }),
    panels: panels.length,
    rollWidth,
    rollLength_mm: nested.rollLength,
    fabricArea_m2: fabricArea,
    netArea_m2: panelArea,
    waste_pct: fabricArea > 0 ? (1 - panelArea / fabricArea) * 100 : 0,
    weight_kg: (panelArea * fabric.gsm) / 1000,
    warpPct, weftPct,
    maxDistortion_pct: Math.max(...panels.map((p) => p.maxErr)) * 100,
    avgDistortion_pct: (panels.reduce((a, p) => a + p.avgErr, 0) / panels.length) * 100,
    seamAngle: th,
    seamAngleDeg: ((th * 180) / Math.PI + 360) % 180,
  };

  return { spec, site, fixings, corners, boundary, mesh, panels, nested, cuts, seamAxis: ax, metrics, fabric, notes: notes.concat(advisories(fixings, corners, metrics, spec, fabric)) };
}

function buildPanels(mesh, ax, cuts, spec, { warpPct, weftPct, h }) {
  const bands = sliceIntoPanels(mesh, ax, cuts, h * 0.12);
  return bands.map((band, i) => {
    const sub = weld(band.tris, h * 0.3, h * h * 0.02);
    const flat = flattenPatch(sub, { iters: spec.quality === 'fast' ? 250 : 700 });
    const loop = flat.loop;
    if (loop.length < 3) throw new Error(t('vj.errLoop', { n: i + 1 }));
    const raw = loop.map((v) => flat.pos[v]);
    const pts3 = loop.map((v) => sub.verts[v]);

    // costura si la arista se apoya en un plano de corte; si no, borde de vela
    const onCut = (p) => cuts.some((c) => Math.abs(p[0] * ax[0] + p[1] * ax[1] - c) < 1.0);
    const kinds = pts3.map((a, k) => (onCut(a) && onCut(pts3[(k + 1) % pts3.length]) ? 'seam' : 'hem'));
    const margins = kinds.map((k) => (k === 'seam' ? spec.seam : spec.hem));

    // se gira el paño a su marco natural: largo del paño = sentido del rollo (urdimbre)
    const axes = panelAxes(raw);
    const toLocal = (p) => {
      const d = [p[0] - axes.c[0], p[1] - axes.c[1]];
      return [d[0] * axes.cross[0] + d[1] * axes.cross[1], d[0] * axes.long[0] + d[1] * axes.long[1]];
    };
    const local = raw.map(toLocal);
    // compensación biaxial: se corta más pequeño para que al tensar llegue a medida
    const net = local.map(([x, y]) => [x / (1 + weftPct / 100), y / (1 + warpPct / 100)]);
    const cut = offsetPolygon(net, margins);

    const nb = bbox(net), cb = bbox(cut);
    return {
      index: i, label: `P${i + 1}`, net, cut, kinds, margins,
      seam3d: pts3, triCount: sub.tris.length, liveCount: flat.tris.length,
      maxErr: flat.maxErr, avgErr: flat.avgErr,
      netWidth: nb.w, netLength: nb.h, cutWidth: cb.w, cutLength: cb.h,
      area_m2: polyArea(net) / 1e6,
    };
  });
}

/** Anchura mínima real de un polígono (calibre por rotación gruesa). */
function minWidth(pts) {
  let best = Infinity;
  for (let a = 0; a < 180; a += 2) {
    const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    let mn = Infinity, mx = -Infinity;
    for (const p of pts) { const v = p[0] * c + p[1] * s; mn = Math.min(mn, v); mx = Math.max(mx, v); }
    best = Math.min(best, mx - mn);
  }
  return best;
}

/* ------------------------- avisos estructurales ---------------------------- */

export function windAdvisory({ speed_ms, area_m2, projected_m2, corners, height_m = 2.5, cf = 1.3 }) {
  const q = 0.613 * speed_ms * speed_ms;                 // presión dinámica, Pa (EN 1991-1-4 simplificado)
  const kz = Math.max(0.8, Math.min(1.4, 0.7 + 0.15 * Math.log(Math.max(height_m, 2) / 2 + 1)));
  const F = (q * kz * cf * projected_m2) / 1000;         // kN
  const perCorner = (F / corners) * 1.6;                 // reparto no uniforme, coef. de mayoración
  return { q_kPa: (q * kz) / 1000, total_kN: F, corner_kN: perCorner };
}

function advisories(fixings, corners, m, spec, fabric) {
  const out = [];
  const n = corners.length;
  const zs = corners.map((p) => p[2]);
  const drop = Math.max(...zs) - Math.min(...zs);
  const span = Math.max(...m.edgeChords);
  const slope = (drop / span) * 100;
  if (slope < 15) out.push(t('vj.lowSlope', { s: slope.toFixed(0) }));
  if (n === 4 && drop < 1) out.push(t('vj.levelAnchors'));
  const minCurve = Math.min(...(spec.curves || [0.08]));
  if (minCurve < 0.06) out.push(t('vj.lowCurve', { c: (minCurve * 100).toFixed(0) }));
  if (m.maxDistortion_pct > 1.5) out.push(t('vj.distortion', { d: m.maxDistortion_pct.toFixed(1) }));
  const piece = (COMMON.rollLength_m || 40) * 1000;
  if (m.rollLength_mm > piece) {
    const piezas = Math.ceil(m.rollLength_mm / piece);
    out.push(t('vj.pieces', { m: (m.rollLength_mm / 1000).toFixed(1), L: COMMON.rollLength_m, n: piezas }));
  }
  if (m.waste_pct > 48) out.push(t('vj.waste', { w: m.waste_pct.toFixed(0) }));
  return out;
}

export { LETTERS };
