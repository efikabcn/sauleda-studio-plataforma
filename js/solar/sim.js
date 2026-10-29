// sim.js — simulación horaria anual de una sala con ventana y protección solar.
//
// Modelo térmico: método horario simplificado 5R1C (EN ISO 13790 anexo C, el mismo
// esquema que recoge EN ISO 52016-1). Una sola zona con una fachada al exterior; el
// resto de paramentos se consideran adiabáticos (sala intermedia de un edificio).
// Radiación sobre la fachada: directa + difusa isótropa + reflejada por el suelo
// (albedo 0,2) a partir del año climático tipo de PVGIS.

import { sunPosition } from '../core/sun.js';
import { getJSON } from '../core/data.js';
import { USES, INERTIA, CITY_TZ, DEFAULT_TZ } from './params.js';

const rad = Math.PI / 180;
const N = 8760;
const T0 = Date.UTC(2025, 0, 1);   // año no bisiesto; el TMY no trae 29-feb
const ALBEDO = 0.2;
const U_FRAME = 2.0;               // W/m²K, perfil de aluminio con RPT
const NAT_VENT_ACH = 4;            // ren/h con ventanas abiertas (modo sin climatización)

const cache = new Map();

/* ------------------------------- clima + sol -------------------------------- */

function lastSunday(y, m) {            // m = 0..11
  const d = new Date(Date.UTC(y, m + 1, 0));
  return d.getUTCDate() - d.getUTCDay();
}
function nthSunday(y, m, n) {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + 7 * (n - 1);
}
/** ¿Horario de verano en este instante UTC? (aproximado a la hora). */
function isDst(ms, rule) {
  const y = 2025;
  if (rule === 'us') {
    const a = Date.UTC(y, 2, nthSunday(y, 2, 2), 7), b = Date.UTC(y, 10, nthSunday(y, 10, 1), 6);
    return ms >= a && ms < b;
  }
  const a = Date.UTC(y, 2, lastSunday(y, 2), 1), b = Date.UTC(y, 9, lastSunday(y, 9), 1);
  return ms >= a && ms < b;
}

/** Carga el TMY de una ciudad y precalcula sol y calendario local. */
export async function loadClimate(id) {
  if (cache.has(id)) return cache.get(id);
  const rec = await getJSON(`data/clima/${id}.json`);
  const [tz, rule] = CITY_TZ[id] || DEFAULT_TZ;
  const alt = new Float32Array(N), az = new Float32Array(N);
  const hour = new Uint8Array(N), dow = new Uint8Array(N), month = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const ms = T0 + i * 3600e3;
    const sp = sunPosition(new Date(ms), rec.lat, rec.lon);
    alt[i] = sp.altitude; az[i] = sp.azimuth;
    const local = new Date(ms + (tz + (isDst(ms, rule) ? 1 : 0)) * 3600e3);
    hour[i] = local.getUTCHours(); dow[i] = local.getUTCDay(); month[i] = local.getUTCMonth();
  }
  const T = Float32Array.from(rec.T, (x) => x / 10);
  const clim = { ...rec, T, alt, az, hour, dow, month };
  clim.hotDay = hottestDay(clim);
  const h0 = hour[clim.hotDay * 24];
  clim.hotStart = clim.hotDay * 24 - (h0 > 12 ? h0 - 24 : h0);   // medianoche local
  cache.set(id, clim);
  return clim;
}

/** Índice (0..364) del día de verano con la media diaria más alta. */
function hottestDay(c) {
  let best = 180, bestT = -99;
  for (let d = 151; d < 273; d++) {          // 1-jun a 30-sep
    let s = 0;
    for (let h = 0; h < 24; h++) s += c.T[d * 24 + h];
    if (s / 24 > bestT) { bestT = s / 24; best = d; }
  }
  return best;
}

/* ------------------------------ geometría toldo ----------------------------- */

/**
 * Fracción de la ventana cuya radiación atraviesa el tejido de un toldo de brazos.
 * Corte 2D por el plano perpendicular a la fachada (ángulo de perfil); se supone
 * que el toldo es más ancho que la ventana, así que no hay entrada lateral.
 * geom: L salida de brazos (m), beta inclinación bajo la horizontal (°),
 *       a altura del enganche sobre el borde superior de la ventana (m).
 */
export function awningGeometry(geom, winH) {
  const P = geom.L * Math.cos(geom.beta * rad);
  const zf = winH + geom.a - geom.L * Math.sin(geom.beta * rad);   // altura del faldón
  const e1 = Math.atan2(zf - winH / 2, P);       // borde del toldo visto desde el centro
  return {
    P, zf,
    fSky: e1 > 0 ? 1 - Math.sin(e1) : 1,         // cielo visto a través del tejido
    fGround: e1 < 0 ? Math.sin(-e1) : 0,         // suelo visto a través del tejido
  };
}
function awningBeam(g, winH, altDeg, gammaDeg) {
  const cg = Math.cos(gammaDeg * rad);
  if (altDeg <= 0 || cg <= 0) return 0;
  const tanPhi = Math.tan(altDeg * rad) / cg;   // tangente del ángulo de perfil
  const zc = g.zf - g.P * tanPhi;                // por encima de zc el rayo cruza el tejido
  return Math.min(1, Math.max(0, (winH - Math.max(zc, 0)) / winH));
}

/* --------------------------------- 5R1C ------------------------------------- */

function buildRoom(cfg, ach = cfg.ach) {
  const use = USES[cfg.use], inert = INERTIA[cfg.inertia];
  const Af = cfg.Af, Aw = cfg.winW * cfg.winH;
  const Ag = Aw * (1 - cfg.frame);
  const Uw = (cfg.glass.U * Ag + U_FRAME * (Aw - Ag)) / Aw;
  const Aop = Math.max(cfg.facadeW * cfg.height - Aw, 0.1);
  const Am = inert.Am * Af, Cm = inert.Cm * Af, At = 4.5 * Af;
  const Htris = 3.45 * At, Htrms = 9.1 * Am, Htrw = Uw * Aw;
  const Htrem = 1 / (1 / (cfg.Uwall * Aop) - 1 / Htrms);
  const Hve = 0.34 * ach * Af * cfg.height;
  const H1 = 1 / (1 / Hve + 1 / Htris), H2 = H1 + Htrw, H3 = 1 / (1 / H2 + 1 / Htrms);
  return { use, Af, Aw, Ag, Am, Cm, At, Htris, Htrms, Htrw, Htrem, Hve, H1, H2, H3 };
}

/** Un paso horario del 5R1C. Devuelve temperaturas de masa, superficie, aire y operativa. */
function step(r, thmPrev, te, phiInt, phiSol, phiHC) {
  const phiIa = 0.5 * phiInt, base = 0.5 * phiInt + phiSol;
  const phiM = (r.Am / r.At) * base;
  const phiSt = (1 - r.Am / r.At - r.Htrw / (9.1 * r.At)) * base;
  const k = r.Cm / 3600, h = 0.5 * (r.H3 + r.Htrem);
  const phiMtot = phiM + r.Htrem * te
    + r.H3 * (phiSt + r.Htrw * te + r.H1 * ((phiIa + phiHC) / r.Hve + te)) / r.H2;
  const thmT = (thmPrev * (k - h) + phiMtot) / (k + h);
  const thm = (thmT + thmPrev) / 2;
  const ths = (r.Htrms * thm + phiSt + r.Htrw * te + r.H1 * (te + (phiIa + phiHC) / r.Hve))
    / (r.Htrms + r.Htrw + r.H1);
  const thair = (r.Htris * ths + r.Hve * te + phiIa + phiHC) / (r.Htris + r.Hve);
  return { thmT, thair, thop: 0.3 * thair + 0.7 * ths };
}

/* ------------------------------- simulación --------------------------------- */

/**
 * @param clim   clima cargado con loadClimate()
 * @param cfg    sala, ventana, vidrio, uso…
 * @param shade  null = sin protección; si no {gt, type, geom, control, threshold}
 * @param hvac   true = con climatización (energía); false = evolución libre (confort)
 */
export function simulate(clim, cfg, shade, hvac) {
  const r0 = buildRoom(cfg);
  // Sin climatización se supone que se abren ventanas cuando fuera hace más fresco.
  const rVent = buildRoom(cfg, cfg.ach + NAT_VENT_ACH);
  const { use } = r0;
  let r = r0, thairPrev = 20;
  const g = cfg.glass.g;
  const ag = shade && shade.type === 'brazos' ? awningGeometry(shade.geom, cfg.winH) : null;

  const out = {
    coolM: new Float64Array(12), heatM: new Float64Array(12), solarM: new Float64Array(12),
    peakCool: 0, h26: 0, h28: 0, maxOp: -99, deployedH: 0,
    hotDay: new Float32Array(24), hotDayTe: new Float32Array(24),
  };

  let thm = 20;
  // Dos pasadas: la primera solo estabiliza la masa térmica.
  for (let pass = 0; pass < 2; pass++) {
    const rec = pass === 1;
    for (let i = 0; i < N; i++) {
      const te = clim.T[i];
      const alt = clim.alt[i], gamma = clim.az[i] - cfg.wallAz;

      // Radiación sobre la fachada vertical.
      let Ib = 0, iam = 1;
      if (alt > 0) {
        const cosI = Math.cos(alt * rad) * Math.cos(gamma * rad);
        if (cosI > 0) {
          Ib = clim.dni[i] * cosI;
          const th = Math.acos(cosI) / 2;
          iam = 1 - Math.tan(th) ** 4;           // pérdida angular del vidrio
        }
      }
      const Id = clim.dhi[i] * 0.5, Ig = clim.ghi[i] * ALBEDO * 0.5;
      const Itot = Ib + Id + Ig;

      let deployed = false;
      if (shade && Itot > 0) {
        if (shade.control === 'siempre') deployed = true;
        else if (shade.control === 'verano') deployed = clim.month[i] >= 4 && clim.month[i] <= 8;
        else deployed = Itot >= shade.threshold;
      }

      let phiSol;
      if (!deployed) {
        phiSol = r.Ag * g * (Ib * iam + 0.9 * (Id + Ig));
      } else {
        let fb = 1, fs = 1, fg = 1;
        if (ag) { fb = awningBeam(ag, cfg.winH, alt, gamma); fs = ag.fSky; fg = ag.fGround; }
        const gt = shade.gt;
        const gtB = shade.type === 'interior' ? gt * iam : gt;
        phiSol = r.Ag * (Ib * ((1 - fb) * g * iam + fb * gtB)
          + Id * ((1 - fs) * g * 0.9 + fs * gt)
          + Ig * ((1 - fg) * g * 0.9 + fg * gt));
        if (rec) out.deployedH++;
      }

      const hr = clim.hour[i], wd = clim.dow[i];
      const occupied = hr >= use.occ[0] && hr < use.occ[1] && (!use.weekdays || (wd >= 1 && wd <= 5));
      const phiInt = r.Af * use.gains * (occupied ? 1 : 0.2);

      r = !hvac && thairPrev > 23 && te < thairPrev - 1 ? rVent : r0;
      let s = step(r, thm, te, phiInt, phiSol, 0);
      let phiHC = 0;
      if (hvac && (use.hvacAlways || occupied)) {
        const set = s.thair > use.cool ? use.cool : s.thair < use.heat ? use.heat : null;
        if (set !== null) {
          const p10 = 10 * r.Af;
          const s10 = step(r, thm, te, phiInt, phiSol, p10);
          phiHC = p10 * (set - s.thair) / (s10.thair - s.thair);
          s = step(r, thm, te, phiInt, phiSol, phiHC);
        }
      }
      thm = s.thmT; thairPrev = s.thair;

      if (!rec) continue;
      const m = clim.month[i];
      out.solarM[m] += phiSol / 1000;
      if (phiHC < 0) { out.coolM[m] += -phiHC / 1000; out.peakCool = Math.max(out.peakCool, -phiHC); }
      if (phiHC > 0) out.heatM[m] += phiHC / 1000;
      if (occupied) {
        if (s.thop > 26) out.h26++;
        if (s.thop > 28) out.h28++;
      }
      out.maxOp = Math.max(out.maxOp, s.thop);
      const k = i - clim.hotStart;
      if (k >= 0 && k < 24) { out.hotDay[k] = s.thop; out.hotDayTe[k] = te; }
    }
  }
  out.cool = out.coolM.reduce((a, b) => a + b, 0);
  out.heat = out.heatM.reduce((a, b) => a + b, 0);
  out.solar = out.solarM.reduce((a, b) => a + b, 0);
  return out;
}
