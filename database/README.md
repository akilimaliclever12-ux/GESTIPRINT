# GestiPrint — Base de données (Supabase)

Socle repris de GestiEcole (school-rdc). **Projet Supabase dédié** (séparé de GestiEcole).

## Appliquer les migrations

Dans le SQL Editor du projet Supabase GestiPrint, exécuter dans l'ordre :

1. `migrations/001_init_tenant.sql` — multi-tenant `imprimerie`, rôles, RLS, provisionnement.
2. `migrations/002_clients.sql` — table `clients` + helper `my_role()` + RLS (lecture = tout le
   personnel du tenant ; écriture = propriétaire/agent, bloquée si abonnement expiré).
3. `migrations/003_commandes.sql` — `commandes` + `commande_lignes` + `compteurs` (numéro
   séquentiel par imprimerie via `next_numero()`), statut, devise, remise, `montant_total`
   (instantané) ; RLS (écriture comptoir ; l'opérateur peut faire avancer le statut).
4. `migrations/004_paiements.sql` — `paiements` (registre **immuable** : taux figé, `montant_usd`
   généré, reçu séquentiel, annulation tracée) ; trigger d'immuabilité + RLS (encaissement =
   comptoir, annulation = propriétaire, aucune suppression). Solde = total − Σ paiements (calculé).
5. `migrations/005_depenses.sql` — `depenses` (sorties de caisse, **append-only** : taux figé,
   `montant_usd` généré, bon séquentiel, annulation tracée) ; trigger append-only + RLS (comptoir
   saisit/annule, aucune suppression). Caisse = recettes (paiements) − dépenses, calculée à la lecture.
6. `migrations/006_rapports.sql` — colonne `commandes.livree_le` + trigger (horodate le passage au
   statut « livrée ») pour reconnaître le **chiffre d'affaires à la livraison** dans les rapports.

**Les 6 migrations couvrent le MVP complet.**

## Onboarding du pilote (une fois)

1. Créer le compte du propriétaire dans **Auth** (email + mot de passe). Le trigger
   `handle_new_user` crée automatiquement sa ligne `profiles` (rôle `agent` par défaut).
2. Connecté en tant que ce compte, appeler la RPC pour créer l'imprimerie et devenir
   propriétaire :

   ```sql
   select public.provision_imprimerie('Nom de l''imprimerie', 'RDC', 'Bukavu');
   ```

   (Depuis le client : `supabase.rpc('provision_imprimerie', { p_nom, p_pays, p_ville })`.)
3. Régler les taux de change sur la ligne `imprimerie` (`taux_fc_usd`, `taux_bif_usd`).

Les comptes `agent` / `operateur` du personnel seront créés par une edge function
dédiée (reprise de GestiEcole `create-*` / `gerer-compte`), étape ultérieure.

## Modèle de sécurité (rappel)

- Chaque table de données porte `imprimerie_id DEFAULT public.my_imprimerie()`.
- RLS : on ne voit/écrit que les lignes de **son** imprimerie.
- Écritures **bloquées** si l'abonnement/essai est expiré (`imprimerie_active`) →
  l'imprimerie passe en **lecture seule** jusqu'au paiement.
- `service_role` (edge functions) contourne la RLS.
