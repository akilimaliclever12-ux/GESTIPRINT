// Supabase client — single shared instance for the whole app.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Helpful message during local setup / on Vercel if env vars are missing.
  console.error('Configuration manquante : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définies.');
}

export const supabase = createClient(url, anonKey);
