// Gestion des accès du personnel par le directeur (via l'edge function
// SECURITY-DEFINER `gerer-compte`). Le directeur peut réinitialiser le mot de
// passe, changer l'email de connexion et modifier le profil d'un membre de SON
// école — pour transmettre le compte à quelqu'un d'autre en cas de départ.
import { supabase } from './supabase.js';

// payload : { target_id, password?, email?, nom?, postnom?, telephone? }
// Ne pas envoyer les champs qu'on ne veut pas modifier.
export async function gererCompte(payload) {
  const { data, error } = await supabase.functions.invoke('gerer-compte', { body: payload });
  if (error) throw new Error(error.message || "Échec de l'opération.");
  if (data?.status !== 'ok') throw new Error(data?.message || 'Une erreur est survenue.');
  return data;
}
