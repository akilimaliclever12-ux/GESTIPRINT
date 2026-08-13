// Loads the current tenant (imprimerie) row for the logged-in user. Offline-first:
// the last successful load is cached in localStorage so the shell (name, devises,
// taux de change) keeps working without a connection.
import { useEffect, useState } from 'react';
import { supabase } from './supabase.js';

const KEY = 'gestiprint.imprimerie';

export function useImprimerie() {
  const [imprimerie, setImprimerie] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;
    // RLS restricts this to the caller's own tenant, so a bare select is safe.
    supabase
      .from('imprimerie')
      .select('*')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setImprimerie(data);
        try {
          localStorage.setItem(KEY, JSON.stringify(data));
        } catch {
          /* quota */
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return imprimerie;
}
