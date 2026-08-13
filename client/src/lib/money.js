// Money formatting. USD shows 2 decimals; FC/BIF are whole-number currencies in
// practice, so no decimals. The stored code 'BIF' displays as « FBU ».
import { deviseLabel } from './frais.js';

export function fmtMoney(amount, devise = 'USD') {
  const n = Number(amount) || 0;
  const code = String(devise || 'USD').toUpperCase();
  const decimals = code === 'USD' ? 2 : 0;
  const s = n.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${s} ${deviseLabel(code)}`;
}

export const DEVISES = ['USD', 'FC', 'BIF'];
