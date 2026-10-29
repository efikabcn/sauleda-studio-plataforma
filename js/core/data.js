// data.js — lectura de ficheros JSON. En la versión de un solo fichero
// (tools/build_single.py) los datos van embebidos en window.__EMBED.

export async function getJSON(path) {
  const emb = globalThis.__EMBED?.[path];
  if (emb) return emb;
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}
