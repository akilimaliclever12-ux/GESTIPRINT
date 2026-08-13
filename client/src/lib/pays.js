// Pays desservis par GestiEcole. Le choix se fait sur le portail d'accueil et
// se propage ensuite partout : landing, inscription, création de l'école.
// Il est MÉMORISÉ (localStorage) pour ne pas redemander à chaque visite.

export const PAYS = {
  RDC: {
    code: 'RDC',
    nom: 'République Démocratique du Congo',
    court: 'RD Congo',
    route: '/rdc',
    // Vocabulaire officiel du pays (bulletins, ministère).
    ministere: "Ministère de l'Éducation Nationale et Nouvelle Citoyenneté",
    systeme: 'Primaire, CTEB et Humanités — bulletins officiels MINEDUC',
  },
  BURUNDI: {
    code: 'BURUNDI',
    nom: 'République du Burundi',
    court: 'Burundi',
    route: '/burundi',
    ministere: "Ministère de l'Éducation Nationale et de la Recherche Scientifique",
    systeme: 'Enseignement Fondamental (9 ans, 4 cycles) et Post-fondamental',
  },
};

const KEY = 'gestiprint_pays';

// Code pays mémorisé, ou null si l'utilisateur n'a pas encore choisi.
export function getPays() {
  try {
    const v = localStorage.getItem(KEY);
    return v && PAYS[v] ? v : null;
  } catch {
    return null; // navigation privée / stockage bloqué
  }
}

export function setPays(code) {
  try {
    if (PAYS[code]) localStorage.setItem(KEY, code);
  } catch {
    /* stockage indisponible : le choix vaudra pour la navigation en cours */
  }
}

export function clearPays() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* rien à faire */
  }
}

// Config du pays courant (RDC par défaut si rien n'est mémorisé).
export function paysCourant() {
  return PAYS[getPays() || 'RDC'];
}
