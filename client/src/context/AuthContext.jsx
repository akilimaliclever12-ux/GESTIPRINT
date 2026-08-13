// Auth context — backed by Supabase Auth.
// Holds the Supabase session + the application profile (with role).
// Roles GestiPrint : 'proprietaire' | 'agent' | 'operateur'.
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { clearAllDrafts } from '../lib/drafts.js';
import { preloadForOffline } from '../lib/preload.js';

const AuthContext = createContext(null);

const PROFILE_KEY = (id) => `gestiprint.profile.${id}`;
const DEFAULT_ROLE = 'agent';
const isOffline = () => typeof navigator !== 'undefined' && !navigator.onLine;

// Fetch the profile row from the server (returns null on any network failure).
async function fetchProfileRow(id) {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id, nom, postnom, role, is_platform_owner, can_impersonate')
      .eq('id', id)
      .maybeSingle();
    return data || null;
  } catch {
    return null; // offline / network error
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { id, email, nom, postnom, role }
  const [loading, setLoading] = useState(true);

  // Loads the profile row (nom, role…) for a given auth user. Offline-first: the
  // last successful profile is cached in localStorage, so restoring a session
  // without a connection keeps the user's REAL identity/role instead of falling
  // back to a generic default.
  async function loadProfile(authUser) {
    if (!authUser) {
      setUser(null);
      return null;
    }
    let profile = await fetchProfileRow(authUser.id);
    if (profile) {
      try {
        localStorage.setItem(PROFILE_KEY(authUser.id), JSON.stringify(profile));
      } catch {
        /* quota */
      }
    } else {
      // Offline (or fetch failed) → reuse the cached profile.
      try {
        profile = JSON.parse(localStorage.getItem(PROFILE_KEY(authUser.id)) || 'null');
      } catch {
        /* ignore */
      }
    }

    const role = profile?.role || DEFAULT_ROLE;
    setUser({
      id: authUser.id,
      email: authUser.email,
      nom: profile?.nom || authUser.email,
      postnom: profile?.postnom || '',
      role,
      isOwner: !!profile?.is_platform_owner,
      canImpersonate: !!profile?.can_impersonate,
    });
    return role;
  }

  useEffect(() => {
    // Restore any existing session on first load.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const role = await loadProfile(session?.user || null);
      setLoading(false);
      preloadForOffline(role); // warm the offline read cache (best-effort)
    });

    // React to login / logout / token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      await loadProfile(session?.user || null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function login(email, password) {
    if (isOffline()) {
      throw new Error(
        "Vous êtes hors ligne. Une connexion Internet est nécessaire pour la première connexion ; ensuite l'application fonctionne hors ligne tant que vous restez connecté.",
      );
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (/fetch|network|failed to fetch|load failed|réseau/i.test(error.message || '')) {
        throw new Error(
          "Échec de connexion : Internet indisponible. Réessayez une fois connecté ; l'application fonctionne ensuite hors ligne.",
        );
      }
      throw error;
    }
    await loadProfile(data.user);
    // Return the freshly loaded role so the caller can redirect.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_platform_owner, can_impersonate')
      .eq('id', data.user.id)
      .maybeSingle();
    preloadForOffline(profile?.role || DEFAULT_ROLE); // warm the offline read cache (best-effort)
    return {
      id: data.user.id,
      role: profile?.role || DEFAULT_ROLE,
      isOwner: !!profile?.is_platform_owner,
      canImpersonate: !!profile?.can_impersonate,
    };
  }

  async function logout() {
    clearAllDrafts(); // don't leave unsaved data on a shared device
    // Drop cached profiles so the next user on a shared device can't see them.
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('gestiprint.profile.'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    // Drop the offline read cache so the next user can't see this account's data
    // offline on a shared device (the outbox of unsynced writes is kept).
    try {
      if (window.caches) await caches.delete('supabase-data');
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
