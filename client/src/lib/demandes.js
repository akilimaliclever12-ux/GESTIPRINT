// Portail client : demandes de commande (insertion publique) + traitement par le
// comptoir (conversion en commande). Voir migration 009.
import { supabase } from './supabase.js';
import { fetchAll } from './db.js';
import { saveRow, updateRows, newId } from './writes.js';

// Infos publiques d'une imprimerie (pour le formulaire public).
export async function getImprimeriePublic(id) {
  const { data, error } = await supabase.from('imprimerie_public').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// Envoi d'une demande (client non authentifié).
export async function submitDemande({ imprimerieId, nom, telephone, email, description }) {
  if (!nom || !nom.trim()) throw new Error('Votre nom est requis.');
  if (!description || !description.trim()) throw new Error('Décrivez votre besoin.');
  const { error } = await supabase.from('demandes').insert({
    imprimerie_id: imprimerieId,
    client_nom: nom.trim(),
    client_telephone: (telephone || '').trim() || null,
    client_email: (email || '').trim() || null,
    description: description.trim(),
  });
  if (error) throw new Error(error.message || 'Envoi impossible.');
  return { ok: true };
}

// --- Côté comptoir --------------------------------------------------------
export function listDemandes() {
  return fetchAll(() => supabase.from('demandes').select('*').order('created_at', { ascending: false }).order('id'));
}

export function refuserDemande(id) {
  return updateRows('demandes', { id }, { statut: 'refusee' });
}

// Convertit une demande en commande : retrouve/crée le client, crée une commande
// brouillon (statut 'nouvelle') reprenant la description, puis marque la demande.
// Retourne l'id de la commande créée.
export async function convertDemande(demande, { createdBy } = {}) {
  // 1) Client : match par téléphone, sinon création.
  let clientId = null;
  if (demande.client_telephone) {
    const { data } = await supabase.from('clients').select('id').eq('telephone', demande.client_telephone).limit(1).maybeSingle();
    clientId = data?.id || null;
  }
  if (!clientId) {
    const cid = newId();
    await saveRow('clients', { id: cid, nom: demande.client_nom, telephone: demande.client_telephone || null, email: demande.client_email || null });
    clientId = cid;
  }
  // 2) Commande brouillon.
  const cmdId = newId();
  await saveRow('commandes', {
    id: cmdId, client_id: clientId, titre: 'Demande via portail',
    note: demande.description, statut: 'nouvelle',
    ...(createdBy ? { created_by: createdBy } : {}),
  });
  // 3) Marque la demande convertie.
  await updateRows('demandes', { id: demande.id }, { statut: 'convertie', commande_id: cmdId });
  return cmdId;
}
