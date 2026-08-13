// Provisional N° PERM generator.
// New students often don't have a SERNIE number yet, so when the field is
// left empty we generate a unique provisional id like "PROV-2025-A3F9K".
// The school replaces it with the real SERNIE number once received.
export function provisionalPerm(annee) {
  const year = (annee || '').split('-')[0] || 'PROV';
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `PROV-${year}-${rand}`;
}

// True if a N° PERM looks like an auto-generated provisional one.
export function isProvisional(perm) {
  return typeof perm === 'string' && perm.startsWith('PROV-');
}
