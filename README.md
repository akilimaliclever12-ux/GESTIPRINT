# GestiPrint

Logiciel SaaS de gestion pour **imprimeries et centres de reprographie**. RDC & Burundi.
Offline-first, multi-tenant, multi-devises (USD / FC / BIF).

Fork indépendant du socle **GestiEcole** (school-rdc) : React 18 + Vite + Supabase,
PWA + APK (Capacitor) + Desktop (Tauri). Produit et base de données **séparés** de GestiEcole.

## Structure

- `client/` — application (Vite + React). Voir `client/package.json` pour les scripts.
- `database/` — migrations SQL Supabase. Voir `database/README.md`.
- `supabase/functions/` — edge functions (à venir : création de comptes personnel).

## Démarrer en local

```bash
cd client
npm install
# créer client/.env.local avec VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev
```

## Plan de build MVP

| Étape | Module | État |
|---|---|---|
| S0 | Fork + socle (auth, offline, devises, packaging) | ✅ fait |
| S1 | Multi-tenant `imprimerie` + rôles + RLS | ✅ fait (migration 001) |
| S2 | Clients (liste, recherche, création/édition offline, fiche) | ✅ fait (migration 002) |
| S3 | Commandes (+ lignes, statut, n° auto, total) | ✅ fait (migration 003) |
| S4 | Paiements + reçu (registre immuable, taux figé, solde, dettes client) | ✅ fait (migration 004) |
| S5 | Caisse (recettes − dépenses par devise, clôture jour/mois) | ✅ fait (migration 005) |
| S6 | Tableau de bord + rapports (argent reçu ≠ CA ≠ bénéfice) | ✅ fait (migration 006) |

**MVP complet.** Reste avant le pilote : brancher un projet Supabase réel (clés) et
appliquer les 6 migrations (voir `database/README.md`), puis tester bout-en-bout.

Rôles : `proprietaire` · `agent` (comptoir) · `operateur` (production).
