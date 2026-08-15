// Reçu imprimable (offline). S'affiche en surimpression ; « Imprimer » ouvre la
// boîte d'impression du navigateur — seule la zone .recu-printable sort au papier
// (voir styles/index.css @media print).
import { fmtMoney } from '../lib/money.js';

const MODE_LABEL = {
  especes: 'Espèces',
  airtel: 'Airtel Money',
  orange: 'Orange Money',
  mpesa: 'M-Pesa',
  banque: 'Banque',
  autre: 'Autre',
};

export default function Recu({ imprimerie, commande, paiement, client, solde, onClose }) {
  return (
    <div className="modal-overlay no-print" onMouseDown={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="recu-printable" style={{ padding: '8px 6px' }}>
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            {imprimerie?.logo_url && (
              <img src={imprimerie.logo_url} alt="" style={{ maxHeight: 60, maxWidth: '80%', objectFit: 'contain', marginBottom: 6 }} />
            )}
            <div style={{ fontSize: 20, fontWeight: 800 }}>{imprimerie?.nom || 'Imprimerie'}</div>
            {imprimerie?.ville && <div style={{ fontSize: 12, color: '#555' }}>{imprimerie.ville}{imprimerie?.telephone ? ` · ${imprimerie.telephone}` : ''}</div>}
            <div style={{ marginTop: 8, fontWeight: 700, letterSpacing: 1 }}>REÇU DE PAIEMENT</div>
            <div style={{ fontSize: 13 }}>N° {paiement?.recu_numero || '— (en attente de synchro)'}</div>
          </div>

          <table style={{ width: '100%', fontSize: 13.5, borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ padding: '3px 0', color: '#555' }}>Date</td><td style={{ textAlign: 'right' }}>{paiement?.date_paiement || new Date().toISOString().slice(0, 10)}</td></tr>
              <tr><td style={{ padding: '3px 0', color: '#555' }}>Client</td><td style={{ textAlign: 'right' }}>{client?.nom || '—'}</td></tr>
              <tr><td style={{ padding: '3px 0', color: '#555' }}>Commande</td><td style={{ textAlign: 'right' }}>{commande?.numero ? `#${commande.numero}` : '—'}{commande?.titre ? ` — ${commande.titre}` : ''}</td></tr>
              <tr><td style={{ padding: '3px 0', color: '#555' }}>Mode</td><td style={{ textAlign: 'right' }}>{MODE_LABEL[paiement?.mode] || paiement?.mode}</td></tr>
            </tbody>
          </table>

          <div style={{ borderTop: '1px dashed #999', borderBottom: '1px dashed #999', margin: '10px 0', padding: '8px 0', display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800 }}>
            <span>Payé</span>
            <span>{fmtMoney(paiement?.montant, paiement?.devise || commande?.devise)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span style={{ color: '#555' }}>Total commande</span>
            <span>{fmtMoney(commande?.montant_total, commande?.devise)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, marginTop: 4 }}>
            <span>Solde restant</span>
            <span>{fmtMoney(solde, commande?.devise)}</span>
          </div>

          <div style={{ textAlign: 'center', marginTop: 14, fontSize: 11, color: '#777' }}>
            Merci de votre confiance — GestiPrint
          </div>
        </div>

        <div className="modal-foot no-print">
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
          <button className="btn btn-primary" onClick={() => window.print()}>Imprimer</button>
        </div>
      </div>
    </div>
  );
}
