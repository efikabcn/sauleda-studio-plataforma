// project.js — datos de proyecto compartidos por los módulos: nombre, cliente y
// ubicación. Se guardan en el navegador y avisan con el evento 'projectchange'.

import { getJSON } from './data.js';

const STORE = 'sauleda-studio-project';
export const project = { name: '', client: '', city: 'barcelona', lat: 41.39, lon: 2.17 };
let cities = [];

export async function loadProject() {
  cities = await getJSON('data/clima/index.json');
  try { Object.assign(project, JSON.parse(localStorage.getItem(STORE)) || {}); } catch { /* sin almacenamiento */ }
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
