// Supabase Edge Function — le PROPRIÉTAIRE d'une imprimerie crée un compte pour
// son personnel (rôle 'agent' = comptoir, ou 'operateur' = production).
//
// Sécurité (défense en profondeur) :
//   - l'appelant est identifié par son JWT (client anon + Authorization) ;
//   - il DOIT être 'proprietaire' et rattaché à une imprimerie ;
//   - le nouveau compte est FORCÉ dans l'imprimerie de l'appelant (jamais une
//     autre), avec un rôle limité à 'agent' | 'operateur' (jamais proprietaire) ;
//   - la création de l'utilisateur Auth se fait avec la clé service_role, qui
//     reste côté serveur (jamais exposée au navigateur).
// Déployer AVEC vérification du JWT (ne pas utiliser --no-verify-jwt).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const ROLES = ['agent', 'operateur'];

// Mot de passe temporaire lisible (sans caractères ambigus) si non fourni.
function tempPassword() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ', a = 'abcdefghijkmnpqrstuvwxyz', d = '23456789';
  const all = A + a + d;
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  let p = A[b[0] % A.length] + a[b[1] % a.length] + d[b[2] % d.length];
  for (let i = 3; i < 12; i++) p += all[b[i] % all.length];
  return 'Gp-' + p;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { message: 'Méthode non autorisée.' });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';

    // 1) Identifier l'appelant.
    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user: caller } } = await authClient.auth.getUser();
    if (!caller) return json(401, { message: 'Non authentifié.' });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // 2) Vérifier que l'appelant est propriétaire d'une imprimerie.
    const { data: me, error: meErr } = await admin
      .from('profiles')
      .select('role, imprimerie_id, actif')
      .eq('id', caller.id)
      .maybeSingle();
    if (meErr) return json(500, { message: meErr.message });
    if (!me || me.role !== 'proprietaire' || !me.imprimerie_id || me.actif === false) {
      return json(403, { message: "Seul le propriétaire de l'imprimerie peut créer des comptes." });
    }

    // 3) Valider l'entrée.
    const body = await req.json().catch(() => ({}));
    const nom = String(body?.nom || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const role = String(body?.role || '').trim();
    let password = String(body?.password || '').trim();
    if (!nom) return json(400, { message: 'Le nom est obligatoire.' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, { message: 'Email invalide.' });
    if (!ROLES.includes(role)) return json(400, { message: 'Rôle invalide (agent ou operateur).' });
    if (password && password.length < 6) return json(400, { message: 'Le mot de passe doit contenir au moins 6 caractères.' });
    const generated = !password;
    if (generated) password = tempPassword();

    // 4) Créer l'utilisateur Auth (email déjà confirmé).
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nom },
    });
    if (cErr || !created?.user) {
      const msg = /already|exist|registered/i.test(cErr?.message || '')
        ? 'Un compte existe déjà avec cet email.'
        : cErr?.message || 'Création impossible.';
      return json(400, { message: msg });
    }
    const newId = created.user.id;

    // 5) Rattacher le profil à l'imprimerie de l'appelant avec le rôle demandé.
    //    (upsert : robuste même si le trigger handle_new_user a déjà posé la ligne.)
    const { error: pErr } = await admin.from('profiles').upsert(
      { id: newId, nom, email, role, imprimerie_id: me.imprimerie_id, actif: true, is_platform_owner: false },
      { onConflict: 'id' },
    );
    if (pErr) {
      // Rollback : supprimer l'utilisateur Auth pour ne pas laisser un orphelin.
      await admin.auth.admin.deleteUser(newId).catch(() => {});
      return json(500, { message: pErr.message });
    }

    return json(200, {
      status: 'ok',
      id: newId,
      email,
      role,
      // Renvoyé UNIQUEMENT quand on a généré le mot de passe, pour que le
      // propriétaire puisse le transmettre. À changer à la 1ère connexion.
      password: generated ? password : undefined,
    });
  } catch (e) {
    return json(500, { message: String((e as Error)?.message || e) });
  }
});
