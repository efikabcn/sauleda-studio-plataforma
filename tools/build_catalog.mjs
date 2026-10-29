// Genera data/fabrics.json, el catálogo único, a partir de los datos de partida de
// Shade Studio (ficha técnica Commercial) y de los genéricos de Solar Studio.
// Se ejecuta UNA vez; a partir de ahí data/fabrics.json es la fuente de verdad y los
// ensayos de laboratorio entran con tools/import_lab.py.
import fs from 'node:fs';
const src = process.argv[2];
const { FABRICS, COMMON, colorsFor } = await import(src);

// Estimación provisional por luminancia del color (HDPE de punto, apertura ~5-10 %).
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const r2 = (v) => Math.round(v * 100) / 100;
const estimate = (hex) => {
  const L = lum(hex);
  return { Ts: r2(0.06 + 0.24 * L), Rs: r2(0.05 + 0.55 * L), Tv: r2(0.05 + 0.22 * L), source: 'estimado' };
};

const families = FABRICS.map((f) => ({
  id: f.id, name: f.name, range: 'Solar Pro Mediterráneo', uses: ['velas'],
  material: COMMON.yarns, construction: f.construction,
  gsm: f.gsm, thickness_mm: f.thickness_mm, roll_mm: f.roll, rollLength_m: COMMON.rollLength_m,
  warranty_y: f.warranty_y, fire: f.flammability, certs: COMMON.certs, tempRange: COMMON.tempRange,
  mech: { tensile: f.tensile, tear: f.tear, burst: f.burst, burstPressure: f.burstPressure },
  patterning: { warp: f.warp, weft: f.weft, estimated: !!f.warpEstimated },
  bicolor: !!f.dual,
  colors: colorsFor(f.id).map((c) => ({
    ref: c.ref, name: c.name, hex: c.hex, ...(c.hex2 ? { hex2: c.hex2 } : {}), ...(c.nuevo ? { nuevo: true } : {}),
    solar: estimate(c.hex),
  })),
}));

const generic = (id, name, name_en, uses, material, colors) => ({
  id, name, name_en, range: 'Genérico de referencia', uses, material, generic: true,
  colors: colors.map(([ref, cname, hex, Ts, Rs, Tv]) => ({ ref, name: cname, hex, solar: { Ts, Rs, Tv, source: 'estimado' } })),
});
families.push(
  generic('gen-acrilico', 'Acrílico para toldo (genérico)', 'Awning acrylic (generic)', ['toldo'], 'Acrílico teñido en masa', [
    ['GEN-ACR-01', 'Blanco', '#F1F0EB', 0.22, 0.66, 0.20],
    ['GEN-ACR-02', 'Crudo / arena', '#D9CDB0', 0.14, 0.55, 0.12],
    ['GEN-ACR-03', 'Gris medio', '#8D8F91', 0.05, 0.20, 0.04],
    ['GEN-ACR-04', 'Azul marino', '#1F2F4D', 0.02, 0.07, 0.02],
    ['GEN-ACR-05', 'Antracita', '#2E2F31', 0.01, 0.05, 0.01]]),
  generic('gen-screen', 'Screen (genérico)', 'Solar screen (generic)', ['toldo', 'screen'], 'Poliéster recubierto de PVC', [
    ['GEN-SCR-01', 'Blanco · apertura 5 %', '#ECECEA', 0.26, 0.62, 0.22],
    ['GEN-SCR-02', 'Gris perla · apertura 3 %', '#B9B8B3', 0.12, 0.35, 0.10],
    ['GEN-SCR-03', 'Carbón · apertura 3 %', '#3A3B3D', 0.05, 0.05, 0.05]]),
);

const out = {
  version: new Date().toISOString().slice(0, 10),
  note: 'Datos solares ESTIMADOS (por luminancia del color o valores típicos de mercado). Sustituir por ensayos EN 14500 / EN 410 con tools/import_lab.py.',
  families,
};
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log(families.length, 'familias,', families.reduce((a, f) => a + f.colors.length, 0), 'colores');
