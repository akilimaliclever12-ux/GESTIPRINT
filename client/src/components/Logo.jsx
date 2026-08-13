// Marque GestiPrint : trois cercles CMY qui se recouvrent (repérage d'impression)
// sur un carré encre. Lisible même en petit. Inline SVG (aucun asset externe).
export default function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label="GestiPrint">
      <rect width="40" height="40" rx="10" fill="#14192e" />
      <g style={{ mixBlendMode: 'screen' }}>
        <circle cx="20" cy="15" r="8.5" fill="#0e7fa8" opacity="0.92" />
        <circle cx="15" cy="24" r="8.5" fill="#e5117c" opacity="0.92" />
        <circle cx="25" cy="24" r="8.5" fill="#f5b301" opacity="0.9" />
      </g>
    </svg>
  );
}
