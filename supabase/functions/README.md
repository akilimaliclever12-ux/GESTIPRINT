# Edge Functions — GestiPrint

## `creer-compte`
Permet au **propriétaire** de créer un compte pour son personnel (`agent` / `operateur`).
La fonction vérifie que l'appelant est propriétaire, puis crée l'utilisateur avec la clé
`service_role` (jamais exposée au navigateur) et le rattache à l'imprimerie de l'appelant.

### Déploiement (sans CLI, via le tableau de bord Supabase)
1. Supabase → projet → **Edge Functions** → **Create a new function**.
2. Nom : `creer-compte` (exactement).
3. Colle le contenu de `creer-compte/index.ts`.
4. Laisse **Verify JWT = activé** (par défaut) — la fonction a besoin du JWT de l'appelant.
5. **Deploy**.

Aucun secret à configurer : `SUPABASE_URL`, `SUPABASE_ANON_KEY` et
`SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement dans les Edge Functions.

### Déploiement (avec la CLI, si installée plus tard)
```bash
supabase functions deploy creer-compte
```
