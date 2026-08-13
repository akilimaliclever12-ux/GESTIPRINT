// Independent-teacher freemium limits + subscription helpers.
export const FREE = {
  primaire: { unit: 'cours', max: 5, label: '5 cours' },
  co: { unit: 'classe', max: 1, label: '1 classe' },
  humanites: { unit: 'classe', max: 1, label: '1 classe' },
};
export const ABO_PRIX = 25000; // FC / an (RDC) — dont 5 000 FC de parrainage
export const ABO_NUMERO = '0975194550'; // Mobile Money
export const ABO_NOM = 'UREDI DIEU-MERCI'; // nom du compte
export const ABO_WHATSAPP = '14342578255'; // support (capture d'écran)
export const TXN_LEN = 18; // ID de transaction (RDC) : 18 caractères

// Abonnement enseignant au Burundi (Lumicash).
export const ABO_PRIX_BIF = 60000; // FBU / an (Burundi) — dont 10 000 FBU de parrainage
export const ABO_NUMERO_BIF = '69537709'; // Lumicash
export const ABO_NOM_BIF = 'AKILIMALI CLEVER';

// Coordonnées d'abonnement enseignant selon le pays ET la devise choisie.
// Le Burundi paie en FBU ; un enseignant RDC peut CHOISIR FBU (Lumicash) au lieu
// de FC. `txnLen` = longueur exacte exigée (FC/RDC) ou null (FBU : référence libre).
export function aboInfos(pays, devise) {
  const bi = String(pays || 'RDC').toUpperCase() === 'BURUNDI';
  const fbu = bi || String(devise || '').toUpperCase() === 'FBU';
  return fbu
    ? { pays: bi ? 'BURUNDI' : 'RDC', devise: 'FBU', prix: ABO_PRIX_BIF, numero: ABO_NUMERO_BIF, nom: ABO_NOM_BIF, canal: 'Lumicash', txnLen: null }
    : { pays: 'RDC', devise: 'FC', prix: ABO_PRIX, numero: ABO_NUMERO, nom: ABO_NOM, canal: 'Mobile Money', txnLen: TXN_LEN };
}

const today = () => new Date().toISOString().slice(0, 10);

export function isSubscribed(profile) {
  return profile?.abo_statut === 'actif' && (!profile?.abo_fin || profile.abo_fin >= today());
}

// En période d'essai (enseignant indépendant).
export function enEssai(profile) {
  return !!profile?.essai_fin && profile.essai_fin >= today();
}
// Peut SAISIR/MODIFIER ses données = abonné OU en essai. Après l'essai sans
// abonnement → lecture seule. (L'export reste réservé aux abonnés.)
export function peutEcrire(profile) {
  return isSubscribed(profile) || enEssai(profile);
}
// Jours d'essai restants (0 si terminé / pas d'essai).
export function joursEssaiRestants(profile) {
  if (!profile?.essai_fin) return 0;
  const diff = Math.ceil((new Date(profile.essai_fin) - new Date(today())) / 86400000);
  return Math.max(0, diff);
}
