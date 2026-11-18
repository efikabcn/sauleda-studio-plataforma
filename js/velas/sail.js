// sail.js — orquestador: de las medidas de obra al patrón de corte.
import { V, solveSite, centroid, planArea, LETTERS } from './geom.js';
import { FABRICS, COMMON } from './fabrics.js';
import { fabricCorners, buildBoundary, relaxSurface, surfaceArea } from './membrane.js';
import { sliceIntoPanels, weld, flattenPatch, panelAxes, offsetPolygon, nest, bbox, polyArea } from './pattern.js';
import { t } from '../core/i18n.js';

export { FABRICS };

/**
 * Pretensado del tejido sobre la mesa o el suelo al marcar el patrón (% en el sentido
 * del rollo). baja = tal como sale del rollo, sin fijar; estándar = clavado por los
 * extremos para que quede plano (1-2 %); alta = estirado con más fuerza (2-3 %).
 */
// Pretensado al marcar (solo urdimbre; en trama apenas hay recorrido y no se descuenta).
// Con el tejido clavado al marcar, la urdimbre se dibuja ~3 % (4 % − 1 %), como hace el sector.
// 'high' queda solo para abrir proyectos antiguos.
export const PRETENSION = { low: 0, std: 1, high: 1 };

/** Compensación por defecto (urdimbre/trama, %): valor de referencia del sector (Mpanel). */
export const DEFAULT_COMP = { warp: 4, weft: 2 };

/**
 * Curvatura de borde recomendada (flecha en % de la cuerda) según la longitud del lado:
 * 3 % hasta 2 m, 5 % a 5 m y 8 % a partir de 11 m. Valores orientativos de taller.
 */
export function recommendedCurve(L_mm) {
  const L = L_mm / 1000;
  const c = L <= 2 ? 3 : L <= 5 ? 3 + ((L - 2) * 2) / 3 : Math.min(8, 5 + (L - 5) * 0.5);
  return Math.round(c * 2) / 2;
}

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
    case 'recommended': {   // criterio de taller: hypar → torsión; si no, perpendicular al lado más largo
      const zs = corners.map((p) => p[2] ?? 0);
      let longest = 0;
      for (let i = 0; i < n; i++) longest = Math.max(longest, edgeLen(i));
      return seamAngle((Math.max(...zs) - Math.min(...zs)) / longest >= 0.1 ? 'hypar' : 'auto', corners);
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
  const prePct = PRETENSION[spec.pretension] ?? 0;
  const warpPct = Number.isFinite(spec.warpPct) ? spec.warpPct : DEFAULT_COMP.warp;
  const weftPct = Number.isFinite(spec.weftPct) ? spec.weftPct : DEFAULT_COMP.weft;
  const usable = rollWidth - 2 * spec.seam;
  if (usable <= 200) throw new Error(t('vj.errUsable'));
  const curveFactor = Math.sqrt(areaSurf / Math.max(areaPlan, 1));
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
    // El número de paños lo marca solo el ancho del rollo: el punto de HDPE absorbe la
    // doble curvatura estirando, así que no se añaden paños para «aplanar» el patrón.
    for (let attempt = 0; attempt < 5; attempt++) {
      cuts = [];
      for (let k = 1; k < count; k++) cuts.push(uMin + (span * k) / count);
      panels = buildPanels(mesh, ax, cuts, { ...spec, quality: quick ? 'fast' : spec.quality }, { warpPct, weftPct, prePct, h: edgeScale });
      const widest = Math.max(...panels.map((p) => p.cutWidth));
      if (widest <= room) { best = { panels, cuts }; break; }
      if (count >= maxCount) break;
      count = Math.min(maxCount, Math.max(count + 1, Math.ceil(count * (widest / room))));
    }
    if (best) { panels = best.panels; cuts = best.cuts; }
    const nested = nest(panels, rollWidth, spec.nestGap ?? 30, quick ? { xstep: 80, col: 40 } : {});
    return { th, ax, cuts, panels, nested };
  };

  let layout;
  if (spec.panelLayout === 'optimo') {          // solo por código: la app ya no lo ofrece
    const cands = [];
    for (let deg = 0; deg < 180; deg += 15) {
      try {
        const cand = layoutFor((deg * Math.PI) / 180, true);
        if (cand.nested.warnings.length) continue;          // no cabe en el rollo
        cands.push({ deg, cost: cand.nested.rollLength });
      } catch (e) { /* dirección inviable */ }
    }
    if (!cands.length) throw new Error(t('vj.errNoDir'));
    cands.sort((a, b) => a.cost - b.cost);
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
    warpPct, weftPct, prePct,
    drawWarpPct: ((1 + warpPct / 100) / (1 + prePct / 100) - 1) * 100,
    seamAngle: th,
    seamAngleDeg: ((th * 180) / Math.PI + 360) % 180,
  };

  // Patrón válido para cortar solo si las diagonales de comprobación cuadran.
  const checks = site.checks;
  const verified = checks.every((c) => c.ok);
  return { spec, site, checks, verified, fixings, corners, boundary, mesh, panels, nested, cuts, seamAxis: ax, metrics, fabric, notes: notes.concat(advisories(fixings, corners, metrics, spec, fabric)) };
}

function buildPanels(mesh, ax, cuts, spec, { warpPct, weftPct, prePct = 0, h }) {
  const bands = sliceIntoPanels(mesh, ax, cuts, h * 0.12);
  return bands.map((band, i) => {
    // Soldadura casi exacta: los vértices del recorte coinciden salvo error de redondeo.
    // Con tolerancias de centímetros se fundían puntos distintos y el contorno se rompía.
    const sub = weld(band.tris, 0.5, 1);
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
    // compensación biaxial: se corta más pequeño para que al tensar llegue a medida.
    // Si al marcar el tejido ya está estirado un prePct en el sentido del rollo, al
    // soltarlo encoge: se dibuja (1 + pre) / (1 + comp) de la medida final.
    const net = local.map(([x, y]) => [x / (1 + weftPct / 100), (y * (1 + prePct / 100)) / (1 + warpPct / 100)]);
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

function advisories(fixings, corners, m, spec, fabric) {
  const out = [];
  const n = corners.length;
  const zs = corners.map((p) => p[2]);
  const drop = Math.max(...zs) - Math.min(...zs);
  // desnivel recomendado: 1/6 del lado más largo, medido entre anclajes
  const fz = fixings.map((p) => p[2]);
  const span = Math.max(...m.fixingSpans);
  const slope = ((Math.max(...fz) - Math.min(...fz)) / span) * 100;
  if (slope < 15) out.push(t('vj.lowSlope', { s: slope.toFixed(0) }));
  if (n === 4 && drop < 1) out.push(t('vj.levelAnchors'));
  (spec.curves || []).forEach((c, i) => {
    const rec = recommendedCurve(m.fixingSpans[i]);
    if (Math.abs(c * 100 - rec) > 2) out.push(t('vj.curveOff', { e: `${LETTERS[i]}${LETTERS[(i + 1) % n]}`, c: (c * 100).toFixed(1), r: rec }));
  });
  const piece = (COMMON.rollLength_m || 40) * 1000;
  if (m.rollLength_mm > piece) {
    const piezas = Math.ceil(m.rollLength_mm / piece);
    out.push(t('vj.pieces', { m: (m.rollLength_mm / 1000).toFixed(1), L: COMMON.rollLength_m, n: piezas }));
  }
  if (m.waste_pct > 48) out.push(t('vj.waste', { w: m.waste_pct.toFixed(0) }));
  return out;
}

export { LETTERS };
