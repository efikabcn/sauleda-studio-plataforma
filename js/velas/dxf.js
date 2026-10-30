// dxf.js — escritor DXF R12 ASCII (compatible con mesas de corte y AutoCAD/Rhino).
import { t } from '../core/i18n.js';

const LAYERS = {
  CORTE: 1,      // rojo — línea de corte
  COSTURA: 3,    // verde — línea de costura / medida acabada
  MARCAS: 5,     // azul — piquetes y referencias
  TEXTO: 7,      // blanco
  ROLLO: 8,      // gris — borde del rollo
  VELA: 2,       // amarillo — geometría de la vela en planta
  ANCLAJES: 6,   // magenta
  COTAS: 4,      // cian
};

export class Dxf {
  constructor() { this.body = []; }

  _pair(code, value) { this.body.push(String(code), String(value)); }

  polyline(layer, pts, closed = true) {
    this._pair(0, 'POLYLINE'); this._pair(8, layer); this._pair(66, 1);
    this._pair(70, closed ? 1 : 0);
    for (const p of pts) {
      this._pair(0, 'VERTEX'); this._pair(8, layer);
      this._pair(10, p[0].toFixed(3)); this._pair(20, p[1].toFixed(3)); this._pair(30, (p[2] || 0).toFixed(3));
    }
    this._pair(0, 'SEQEND'); this._pair(8, layer);
    return this;
  }

  line(layer, a, b) {
    this._pair(0, 'LINE'); this._pair(8, layer);
    this._pair(10, a[0].toFixed(3)); this._pair(20, a[1].toFixed(3)); this._pair(30, (a[2] || 0).toFixed(3));
    this._pair(11, b[0].toFixed(3)); this._pair(21, b[1].toFixed(3)); this._pair(31, (b[2] || 0).toFixed(3));
    return this;
  }

  circle(layer, c, r) {
    this._pair(0, 'CIRCLE'); this._pair(8, layer);
    this._pair(10, c[0].toFixed(3)); this._pair(20, c[1].toFixed(3)); this._pair(30, 0);
    this._pair(40, r.toFixed(3));
    return this;
  }

  text(layer, p, height, str, rot = 0) {
    this._pair(0, 'TEXT'); this._pair(8, layer);
    this._pair(10, p[0].toFixed(3)); this._pair(20, p[1].toFixed(3)); this._pair(30, 0);
    this._pair(40, height.toFixed(3)); this._pair(1, String(str)); this._pair(50, rot.toFixed(2));
    return this;
  }

  toString() {
    const head = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC'];
    const tbl = ['0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', String(Object.keys(LAYERS).length)];
    for (const [name, color] of Object.entries(LAYERS)) {
      tbl.push('0', 'LAYER', '2', name, '70', '0', '62', String(color), '6', 'CONTINUOUS');
    }
    tbl.push('0', 'ENDTAB', '0', 'ENDSEC');
    const ent = ['0', 'SECTION', '2', 'ENTITIES', ...this.body, '0', 'ENDSEC'];
    return [...head, ...tbl, ...ent, '0', 'EOF'].join('\r\n') + '\r\n';
  }
}

/** Plano de corte: paños anidados sobre el rollo, con líneas de corte y costura. */
export function cutPlanDXF(result, meta = {}) {
  const d = new Dxf();
  const { nested, metrics, panels } = result;
  const W = metrics.rollWidth, L = metrics.rollLength_mm;
  d.polyline('ROLLO', [[0, 0], [W, 0], [W, L], [0, L]], true);
  d.text('TEXTO', [0, L + 120], 90, `${meta.project || t('vx.sail')} · ${t('vx.roll')} ${W} mm x ${(L / 1000).toFixed(2)} m · ${result.fabric.name}`);
  for (const p of nested.placed) {
    d.polyline('CORTE', p.nestCut, true);
    d.polyline('COSTURA', p.nestNet, true);
    const c = p.nestNet.reduce((a, q) => [a[0] + q[0] / p.nestNet.length, a[1] + q[1] / p.nestNet.length], [0, 0]);
    d.text('TEXTO', [c[0] - 120, c[1]], 110, `${p.label}${p.flip ? ' (girado 180)' : ''}`);
    d.text('TEXTO', [c[0] - 260, c[1] - 160], 60, `${Math.round(p.netWidth)} x ${Math.round(p.netLength)} mm`);
    // piquetes de casado en las costuras cada 500 mm
    for (let k = 0; k < p.nestNet.length; k++) {
      if (p.kinds[k] !== 'seam') continue;
      const a = p.nestNet[k], b = p.nestNet[(k + 1) % p.nestNet.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 0; t < len; t += 500) {
        const u = t / len;
        const m = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
        const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
        d.line('MARCAS', [m[0] - nx * 25, m[1] - ny * 25], [m[0] + nx * 25, m[1] + ny * 25]);
      }
    }
  }
  return d.toString();
}

/** Planta técnica: anclajes, vela, cotas de lados y diagonales. */
export function planDXF(result, meta = {}) {
  const d = new Dxf();
  const { fixings, corners, boundary, metrics } = result;
  const LET = 'ABCDEFGH';
  d.polyline('VELA', boundary.loop.map((p) => [p[0], p[1], 0]), true);
  d.polyline('COTAS', corners.map((p) => [p[0], p[1], 0]), true);
  fixings.forEach((p, i) => {
    d.circle('ANCLAJES', p, 60);
    d.line('ANCLAJES', [p[0] - 120, p[1]], [p[0] + 120, p[1]]);
    d.line('ANCLAJES', [p[0], p[1] - 120], [p[0], p[1] + 120]);
    d.text('TEXTO', [p[0] + 150, p[1] + 120], 180, `${LET[i]}  h=${Math.round(p[2])}`);
  });
  fixings.forEach((p, i) => {
    const q = fixings[(i + 1) % fixings.length];
    const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const ang = (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;
    d.text('COTAS', m, 130, `${LET[i]}${LET[(i + 1) % fixings.length]} = ${Math.round(metrics.fixingSpansPlan[i])} (planta)`, ang);
  });
  boundary.cornerIdx.forEach((idx, i) => {
    const p = boundary.loop[idx];
    d.text('TEXTO', [p[0], p[1] - 220], 120, `${t('vx.edge')} ${LET[i]}${LET[(i + 1) % fixings.length]} = ${Math.round(metrics.edgeLengths[i])}`);
  });
  d.text('TEXTO', [0, -900], 160, `${meta.project || t('vx.sail')} · ${t('vx.area')} ${metrics.areaSurface_m2.toFixed(2)} m2 · ${metrics.panels} ${t('vx.panels')}`);
  return d.toString();
}

/** Listado de fabricación en CSV. */
export function csvReport(result, meta = {}) {
  const { metrics: m, panels, fabric } = result;
  const LET = 'ABCDEFGH';
  const rows = [
    [t('vx.cProject'), meta.project || ''],
    [t('vx.cDate'), new Date().toISOString().slice(0, 10)],
    [t('vx.cFabric'), fabric.name],
    [t('vx.cRollW'), m.rollWidth],
    [t('vx.cRollL'), (m.rollLength_mm / 1000).toFixed(2)],
    [t('vx.cArea'), m.areaSurface_m2.toFixed(2)],
    [t('vx.cNet'), m.netArea_m2.toFixed(2)],
    [t('vx.cWaste'), m.waste_pct.toFixed(1)],
    [t('vx.cWeight'), m.weight_kg.toFixed(2)],
    [t('vx.cWarp'), m.warpPct.toFixed(2)],
    [t('vx.cWeft'), m.weftPct.toFixed(2)],
    [t('vx.cSeam'), m.seamAngleDeg.toFixed(1)],
    [],
    [t('vj.side'), t('vj.rPlanMm'), t('vj.rRealMm'), t('vj.rChordMm'), t('vj.rEdgeMm')],
  ];
  m.edgeLengths.forEach((L, i) => rows.push([`${LET[i]}${LET[(i + 1) % m.edgeLengths.length]}`, Math.round(m.fixingSpansPlan[i]), Math.round(m.fixingSpans[i]), Math.round(m.edgeChords[i]), Math.round(L)]));
  rows.push([], [t('vj.panel'), t('vx.cFinW'), t('vx.cFinL'), t('vx.cCutW'), t('vx.cCutL'), t('vx.cPArea'), t('vx.cDist')]);
  panels.forEach((p) => rows.push([p.label, Math.round(p.netWidth), Math.round(p.netLength), Math.round(p.cutWidth), Math.round(p.cutLength), p.area_m2.toFixed(2), (p.maxErr * 100).toFixed(2)]));
  return rows.map((r) => r.join(';')).join('\n');
}
