// Gestion du personnel par le propriétaire. La création d'un compte passe par
// l'edge function `creer-compte` (droits admin côté serveur) ; l'activation /
// désactivation est un simple UPDATE du profil (autorisé au propriétaire par la
// RLS). La lecture est cloisonnée à l'imprimerie par la RLS.
import { supabase } from './supabase.js';
import { fetchAll } from './db.js';
import { updateRows } from './writes.js';

export function listStaff() {
  return fetchAll(() =>
    supabase
      .from('profiles')
      .select('id, nom, email, role, actif, created_at')
      .in('role', ['agent', 'operateur'])
      .order('nom')
      .order('id'),
  );
}

// Crée un compte agent/operateur. Renvoie { id, email, role, password? }.
// `password` n'est présent que s'il a été généré (à transmettre au salarié).
export async function createStaff({ nom, email, role, password }) {
  const { data, error } = await supabase.functions.invoke('creer-compte', {
    body: { nom, email, role, password: password || undefined },
  });
  // supabase.functions.invoke renvoie une erreur générique sur statut non-2xx ;
  // le message précis est dans data.message si le corps a pu être lu.
  if (error) throw new Error(data?.message || error.message || 'Création impossible.');
  if (data?.status !== 'ok') throw new Error(data?.message || 'Création impossible.');
  return data;
}

export function setActif(id, actif) {
  return updateRows('profiles', { id }, { actif });
}
