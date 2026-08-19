// Machines & pannes. Le personnel déclare une panne (machine hors service) et la
// résout. Indicateur « machines en panne » = pannes non résolues.
import { supabase } from './supabase.js';
import { fetchAll } from './db.js';
import { saveRow, updateRows } from './writes.js';

export function listMachines() {
  return fetchAll(() => supabase.from('machines').select('*').order('nom').order('id'));
}
export function saveMachine(values) {
  return saveRow('machines', {
    ...(values.id ? { id: values.id } : {}),
    nom: (values.nom || '').trim(),
    type: (values.type || '').trim() || null,
  });
}

// Pannes (avec le nom de la machine). onlyOpen = non résolues.
export function listPannes({ onlyOpen = false } = {}) {
  return fetchAll(() => {
    let q = supabase.from('pannes').select('*, machine:machines(nom)');
    if (onlyOpen) q = q.eq('resolu', false);
    return q.order('resolu').order('date_debut', { ascending: false }).order('id');
  });
}
export function declarerPanne({ machineId, description }) {
  if (!description || !description.trim()) throw new Error('Décrivez la panne.');
  return saveRow('pannes', { machine_id: machineId, description: description.trim() });
}
export function resoudrePanne(id, cout, devise) {
  return updateRows('pannes', { id }, {
    resolu: true, date_fin: new Date().toISOString().slice(0, 10),
    cout: cout === '' || cout == null ? null : Number(cout), devise: devise || 'USD',
  });
}
export async function pannesOuvertes() {
  const { count } = await supabase.from('pannes').select('id', { count: 'exact', head: true }).eq('resolu', false);
  return count || 0;
}
