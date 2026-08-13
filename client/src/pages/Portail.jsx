// Public landing (web only). In the installed apps we skip straight to /login.
import { Link } from 'react-router-dom';

export default function Portail() {
  return (
    <div className="landing">
      <header className="landing-hero">
        <h1 style={{ color: 'var(--bleu-fonce, #0A69AC)', marginBottom: 6 }}>GestiPrint</h1>
        <p style={{ fontSize: 18, color: 'var(--texte-clair)', maxWidth: 620, margin: '0 auto 22px' }}>
          Le logiciel de gestion pour imprimeries et centres de reprographie. Suivez vos commandes, sachez qui vous doit
          de l'argent, et maîtrisez votre caisse — même hors ligne.
        </p>
        <Link to="/login" className="btn btn-primary" style={{ fontSize: 16, padding: '11px 22px' }}>
          Se connecter
        </Link>
      </header>

      <section className="landing-features" style={{ maxWidth: 900, margin: '40px auto', padding: '0 16px' }}>
        <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 18, listStyle: 'none', padding: 0 }}>
          <li className="card"><strong>Commandes</strong><br />De la prise de commande à la livraison, avec acompte et solde.</li>
          <li className="card"><strong>Dettes clients</strong><br />Qui doit combien, en un coup d'œil.</li>
          <li className="card"><strong>Caisse</strong><br />Recettes, dépenses, clôture journalière — USD, FC, BIF.</li>
          <li className="card"><strong>Hors ligne</strong><br />Vos saisies sont conservées et envoyées au retour d'Internet.</li>
        </ul>
      </section>

      <footer style={{ textAlign: 'center', padding: 24, color: 'var(--texte-clair)', fontSize: 13 }}>
        © GestiPrint — RDC & Burundi
      </footer>
    </div>
  );
}
