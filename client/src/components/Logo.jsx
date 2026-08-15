// Logo GestiPrint (image fournie). `size` = hauteur en px ; la largeur suit le
// ratio. Sur fond sombre, envelopper dans une pastille blanche (voir .logo-chip).
export default function Logo({ size = 32, chip = false }) {
  const img = (
    <img
      src="/gestiprint.png"
      alt="GestiPrint"
      className="logo-img"
      style={{ height: size, width: 'auto', maxWidth: '100%', display: 'block', objectFit: 'contain' }}
    />
  );
  return chip ? <span className="logo-chip">{img}</span> : img;
}
