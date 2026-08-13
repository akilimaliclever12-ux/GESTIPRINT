// Synchronisation temps réel : rappelle `refresh()` dès qu'une des `tables`
// change côté serveur (Supabase Realtime / postgres_changes). Les événements
// sont filtrés par la RLS → on ne reçoit que les changements de SON école.
//
// Usage : useRealtimeRefresh('eleves', load)  ou  useRealtimeRefresh(['eleves','paiements'], load)
// `load` peut changer à chaque rendu : on garde toujours la dernière version.
import { useEffect, useRef } from 'react';
import { supabase } from './supabase.js';

export function useRealtimeRefresh(tables, refresh, enabled = true) {
  const cb = useRef(refresh);
  cb.current = refresh;
  const list = Array.isArray(tables) ? tables : [tables];
  const dep = list.filter(Boolean).join(',');

  useEffect(() => {
    if (!enabled || !dep) return undefined;
    let timer;
    // Débounce : plusieurs changements rapprochés → un seul rafraîchissement.
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(() => cb.current && cb.current(), 400);
    };
    let channel;
    try {
      channel = supabase.channel(`rt:${dep}:${Date.now()}`);
      dep.split(',').forEach((t) => {
        channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, bump);
      });
      channel.subscribe();
    } catch {
      /* Realtime indisponible (hors ligne / non configuré) — sans effet */
    }
    return () => {
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [dep, enabled]);
}
