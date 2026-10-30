// project.js — datos de proyecto compartidos por los módulos: nombre, cliente y
// ubicación. Se guardan en el navegador y avisan con el evento 'projectchange'.

import { getJSON } from './data.js';

const STORE = 'sauleda-studio-project';
export const project = { name: '', client: '', city: 'barcelona', lat: 41.39, lon: 2.17 };
let cities = [];

/**
 * @param defaultCity  ciudad del mercado (Barcelona en España, Miami en EE. UU.)
 * @param forceCountry si llega el mercado por URL y la ciudad guardada es de otro país,
 *                     se usa la del mercado (la web de EE. UU. no abre en Barcelona).
 */
export async function loadProject(defaultCity, forceCountry = null) {
  cities = await getJSON('data/clima/index.json');
  project.city = defaultCity;
  try { Object.assign(project, JSON.parse(localStorage.getItem(STORE)) || {}); } catch { /* sin almacenamiento */ }
  const c = cityById(project.city);
  if (!c || (forceCountry && (c.country === 'US') !== (forceCountry === 'US'))) project.city = defaultCity;
  const d = cityById(project.city);
  if (d) { project.lat = d.lat; project.lon = d.lon; }
  return project;
}
export const cityList = () => cities;
export const cityById = (id) => cities.find((c) => c.id === id);

export function updateProject(patch) {
  Object.assign(project, patch);
  if (patch.city) {
    const c = cityById(patch.city);
    if (c) { project.lat = c.lat; project.lon = c.lon; }
  }
  try { localStorage.setItem(STORE, JSON.stringify(project)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new CustomEvent('projectchange', { detail: { ...patch } }));
}
