-- =====================================================================
-- GestiPrint — Schéma complet (migrations 001 → 009). Idempotent.
-- =====================================================================

-- >>>>>> migrations/001_init_tenant.sql
-- =====================================================================
-- GestiPrint — Migration 001 : socle multi-tenant (imprimerie) + rôles + RLS
-- =====================================================================
-- Patron repris de GestiEcole (school-rdc, migrations 007/008/009/010) :
--   - chaque table de données porte imprimerie_id DEFAULT my_imprimerie()
--   - RLS : on ne voit/écrit que les lignes de SON imprimerie
--   - les ÉCRITURES sont bloquées si l'abonnement/essai est expiré
--     (imprimerie passe en LECTURE SEULE jusqu'au paiement)
-- Non destructif, idempotent (IF NOT EXISTS / OR REPLACE).
-- La clé service_role (edge functions) contourne la RLS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) PROFILES — un par utilisateur Supabase Auth
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
    id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nom               VARCHAR(100) NOT NULL DEFAULT '',
    postnom           VARCHAR(100),
    email             VARCHAR(150),
    telephone         VARCHAR(30),
    role              VARCHAR(20) NOT NULL DEFAULT 'agent'
                      CHECK (role IN ('proprietaire', 'agent', 'operateur')),
    imprimerie_id     UUID,                       -- FK ajoutée après création d'imprimerie
    is_platform_owner BOOLEAN NOT NULL DEFAULT FALSE,   -- toi (éditeur SaaS)
    can_impersonate   BOOLEAN NOT NULL DEFAULT FALSE,
    actif             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 2) IMPRIMERIE — racine du locataire (tenant)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS imprimerie (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom              VARCHAR(200) NOT NULL,
    pays             VARCHAR(10) NOT NULL DEFAULT 'RDC' CHECK (pays IN ('RDC', 'BURUNDI')),
    ville            VARCHAR(100),
    adresse          VARCHAR(200),
    telephone        VARCHAR(30),
    logo_url         TEXT,
    -- Devises : USD est la devise de report. FC (CDF) et BIF ont chacune leur
    -- taux (unités de devise locale pour 1 USD). Voir lib/frais.js côté client.
    devise_principale VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (devise_principale IN ('USD','FC','BIF')),
    taux_fc_usd      NUMERIC(12,4),   -- FC pour 1 USD
    taux_bif_usd     NUMERIC(12,4),   -- BIF pour 1 USD
    -- Abonnement SaaS : essai / actif / expire / suspendu. Au pilote : 'actif'.
    statut           VARCHAR(20) NOT NULL DEFAULT 'essai'
                     CHECK (statut IN ('essai', 'actif', 'expire', 'suspendu')),
    essai_fin        DATE,
    abonnement_fin   DATE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK profiles.imprimerie_id -> imprimerie(id) (posée maintenant que la table existe)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_imprimerie_fk') THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_imprimerie_fk
      FOREIGN KEY (imprimerie_id) REFERENCES imprimerie(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_profiles_imprimerie ON profiles(imprimerie_id);

-- ---------------------------------------------------------------------
-- 3) FONCTIONS D'AIDE (utilisées par la RLS et l'UI)
-- ---------------------------------------------------------------------

-- L'imprimerie de l'utilisateur connecté.
CREATE OR REPLACE FUNCTION public.my_imprimerie()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT imprimerie_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Vrai si l'utilisateur connecté est PROPRIÉTAIRE (et actif).
CREATE OR REPLACE FUNCTION public.is_proprietaire()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'proprietaire' AND actif = TRUE
  );
$$;

-- Vrai si l'utilisateur connecté est l'éditeur de la plateforme (toi).
CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_platform_owner = TRUE AND actif = TRUE
  );
$$;

-- Vrai si l'imprimerie peut ÉCRIRE (abonnée, ou en essai non expiré).
CREATE OR REPLACE FUNCTION public.imprimerie_active(iid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.imprimerie
    WHERE id = iid
      AND (statut = 'actif'
           OR (statut = 'essai' AND COALESCE(essai_fin, CURRENT_DATE) >= CURRENT_DATE))
  );
$$;

-- ---------------------------------------------------------------------
-- 4) RLS
-- ---------------------------------------------------------------------
ALTER TABLE profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE imprimerie ENABLE ROW LEVEL SECURITY;

-- Table rase sur ces deux tables (réexécution sûre).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN ('profiles','imprimerie')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- PROFILES :
--   - on lit TOUJOURS son propre profil (nécessaire à l'onboarding : un
--     utilisateur sans imprimerie doit pouvoir se lire pour la provisionner),
--   - un propriétaire lit/écrit les profils de SON imprimerie,
--   - l'éditeur plateforme lit tout.
CREATE POLICY p_profiles_select ON profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (imprimerie_id = public.my_imprimerie() AND public.is_proprietaire())
    OR public.is_platform_owner()
  );
CREATE POLICY p_profiles_update_self ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
CREATE POLICY p_profiles_write_owner ON profiles FOR ALL TO authenticated
  USING (imprimerie_id = public.my_imprimerie() AND public.is_proprietaire())
  WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.is_proprietaire());

-- IMPRIMERIE :
--   - on voit la ligne de SON imprimerie (ou l'éditeur plateforme voit tout),
--   - seul le propriétaire modifie, et seulement si l'abonnement est actif.
CREATE POLICY p_imprimerie_select ON imprimerie FOR SELECT TO authenticated
  USING (id = public.my_imprimerie() OR public.is_platform_owner());
CREATE POLICY p_imprimerie_update ON imprimerie FOR UPDATE TO authenticated
  USING (id = public.my_imprimerie() AND public.is_proprietaire() AND public.imprimerie_active(id))
  WITH CHECK (id = public.my_imprimerie() AND public.is_proprietaire());

-- ---------------------------------------------------------------------
-- 5) SIGNUP : créer automatiquement un profil à chaque inscription Auth
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, nom, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nom', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------
-- 6) PROVISIONNEMENT : le 1er utilisateur crée SON imprimerie et en devient
--    propriétaire. SECURITY DEFINER = contourne la RLS le temps du setup.
--    (Au pilote, on appellera cette RPC une fois pour créer l'imprimerie.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_imprimerie(
  p_nom   TEXT,
  p_pays  TEXT DEFAULT 'RDC',
  p_ville TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id  UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié.';
  END IF;
  -- Un utilisateur déjà rattaché ne peut pas provisionner une 2e imprimerie.
  IF (SELECT imprimerie_id FROM public.profiles WHERE id = v_uid) IS NOT NULL THEN
    RAISE EXCEPTION 'Cet utilisateur est déjà rattaché à une imprimerie.';
  END IF;

  INSERT INTO public.imprimerie (nom, pays, ville, statut)
  VALUES (p_nom, COALESCE(NULLIF(p_pays, ''), 'RDC'), p_ville, 'actif')   -- pilote : actif d'emblée
  RETURNING id INTO v_id;

  UPDATE public.profiles
     SET imprimerie_id = v_id, role = 'proprietaire'
   WHERE id = v_uid;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.provision_imprimerie(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_imprimerie(TEXT, TEXT, TEXT) TO authenticated;

-- >>>>>> migrations/002_clients.sql
-- =====================================================================
-- GestiPrint — Migration 002 : Clients
-- =====================================================================
-- Table des clients de l'imprimerie. Multi-tenant (imprimerie_id auto),
-- cloisonnée par RLS, écritures bloquées si l'abonnement est expiré.
-- Le SOLDE DÛ d'un client n'est PAS stocké ici : il sera calculé à partir des
-- commandes et paiements (S3/S4) — argent reçu ≠ CA, solde toujours dérivé.
-- Idempotent.
-- =====================================================================

-- Helper réutilisable : le rôle de l'utilisateur connecté.
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imprimerie_id UUID NOT NULL DEFAULT public.my_imprimerie() REFERENCES imprimerie(id) ON DELETE CASCADE,
  nom           VARCHAR(160) NOT NULL,
  telephone     VARCHAR(30),
  email         VARCHAR(150),
  adresse       VARCHAR(200),
  note          TEXT,
  actif         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_imprimerie ON clients(imprimerie_id);
CREATE INDEX IF NOT EXISTS idx_clients_nom ON clients(imprimerie_id, nom);

-- ---------------------------------------------------------------------
-- RLS : lecture pour tout le personnel de l'imprimerie ; écriture pour
-- propriétaire + comptoir (agent), et seulement si l'abonnement est actif.
-- L'opérateur (production) est en lecture seule sur les clients.
-- ---------------------------------------------------------------------
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'clients'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.clients', r.policyname);
  END LOOP;
END $$;

CREATE POLICY c_clients_select ON clients FOR SELECT TO authenticated
  USING (imprimerie_id = public.my_imprimerie());

CREATE POLICY c_clients_write ON clients FOR ALL TO authenticated
  USING (
    imprimerie_id = public.my_imprimerie()
    AND public.my_role() IN ('proprietaire', 'agent')
    AND public.imprimerie_active(imprimerie_id)
  )
  WITH CHECK (
    imprimerie_id = public.my_imprimerie()
    AND public.my_role() IN ('proprietaire', 'agent')
    AND public.imprimerie_active(imprimerie_id)
  );

-- >>>>>> migrations/003_commandes.sql
-- =====================================================================
-- GestiPrint — Migration 003 : Commandes (+ lignes) — cœur métier
-- =====================================================================
-- Une commande appartient à un client et porte des lignes libres
-- (désignation + quantité + prix unitaire). Numéro SÉQUENTIEL par imprimerie.
-- Multi-tenant + RLS. Le SOLDE n'est pas ici : il se calcule au module
-- Paiements (S4) = montant_total − paiements. montant_total est un instantané
-- (somme des lignes − remise) écrit par l'app au moment de l'enregistrement.
-- Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Compteurs par tenant (numéros séquentiels : commandes, reçus…)
--    Incrément ATOMIQUE via upsert RETURNING (pas de course).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compteurs (
  imprimerie_id UUID NOT NULL DEFAULT public.my_imprimerie() REFERENCES imprimerie(id) ON DELETE CASCADE,
  type          VARCHAR(20) NOT NULL,
  valeur        INT NOT NULL DEFAULT 0,
  PRIMARY KEY (imprimerie_id, type)
);
ALTER TABLE compteurs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='compteurs' AND policyname='cpt_select') THEN
    CREATE POLICY cpt_select ON compteurs FOR SELECT TO authenticated
      USING (imprimerie_id = public.my_imprimerie());
  END IF;
END $$;

-- Renvoie le prochain numéro pour (imprimerie, type). SECURITY DEFINER : écrit
-- dans compteurs en contournant la RLS (l'appelant n'a pas de droit d'écriture).
CREATE OR REPLACE FUNCTION public.next_numero(iid UUID, p_type TEXT)
RETURNS INT LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.compteurs (imprimerie_id, type, valeur)
  VALUES (iid, p_type, 1)
  ON CONFLICT (imprimerie_id, type) DO UPDATE SET valeur = compteurs.valeur + 1
  RETURNING valeur;
$$;

-- ---------------------------------------------------------------------
-- 1) COMMANDES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commandes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imprimerie_id UUID NOT NULL DEFAULT public.my_imprimerie() REFERENCES imprimerie(id) ON DELETE CASCADE,
  numero        INT,                                   -- rempli par trigger (séquentiel/tenant)
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  titre         VARCHAR(200),
  statut        VARCHAR(20) NOT NULL DEFAULT 'nouvelle'
                CHECK (statut IN ('nouvelle', 'en_production', 'terminee', 'livree', 'annulee')),
  devise        VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (devise IN ('USD', 'FC', 'BIF')),
  remise        NUMERIC(12,2) NOT NULL DEFAULT 0,
  montant_total NUMERIC(12,2) NOT NULL DEFAULT 0,       -- instantané = Σ lignes − remise
  date_prevue   DATE,
  fichier_url   TEXT,
  note          TEXT,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commandes_imprimerie ON commandes(imprimerie_id);
CREATE INDEX IF NOT EXISTS idx_commandes_client ON commandes(client_id);
CREATE INDEX IF NOT EXISTS idx_commandes_statut ON commandes(imprimerie_id, statut);
CREATE UNIQUE INDEX IF NOT EXISTS uq_commandes_numero ON commandes(imprimerie_id, numero);

-- Attribution du numéro séquentiel à l'insertion (si non fourni).
CREATE OR REPLACE FUNCTION public.commandes_set_numero()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := public.next_numero(NEW.imprimerie_id, 'commande');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_commandes_numero ON commandes;
CREATE TRIGGER trg_commandes_numero
  BEFORE INSERT ON commandes
  FOR EACH ROW EXECUTE FUNCTION public.commandes_set_numero();

-- ---------------------------------------------------------------------
-- 2) COMMANDE_LIGNES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commande_lignes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imprimerie_id  UUID NOT NULL DEFAULT public.my_imprimerie() REFERENCES imprimerie(id) ON DELETE CASCADE,
  commande_id    UUID NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  designation    VARCHAR(300) NOT NULL,
  quantite       NUMERIC(12,2) NOT NULL DEFAULT 1,
  prix_unitaire  NUMERIC(12,2) NOT NULL DEFAULT 0,
  montant        NUMERIC(12,2) NOT NULL DEFAULT 0,      -- = quantite × prix_unitaire (calculé app)
  position       INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lignes_commande ON commande_lignes(commande_id);
CREATE INDEX IF NOT EXISTS idx_lignes_imprimerie ON commande_lignes(imprimerie_id);

-- ---------------------------------------------------------------------
-- 3) RLS
--   - lecture : tout le personnel du tenant
--   - écriture commandes/lignes : propriétaire + agent (comptoir), si actif
--   - l'OPÉRATEUR (production) peut UPDATE une commande (changer le statut)
-- ---------------------------------------------------------------------
ALTER TABLE commandes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE commande_lignes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname='public' AND tablename IN ('commandes','commande_lignes')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- COMMANDES
CREATE POLICY cmd_select ON commandes FOR SELECT TO authenticated
  USING (imprimerie_id = public.my_imprimerie());

CREATE POLICY cmd_write_comptoir ON commandes FOR ALL TO authenticated
  USING (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id))
  WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id));

-- L'opérateur ne peut que faire AVANCER le statut (UPDATE), pas créer/supprimer.
CREATE POLICY cmd_update_operateur ON commandes FOR UPDATE TO authenticated
  USING (imprimerie_id = public.my_imprimerie() AND public.my_role() = 'operateur' AND public.imprimerie_active(imprimerie_id))
  WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.my_role() = 'operateur' AND public.imprimerie_active(imprimerie_id));

-- COMMANDE_LIGNES
CREATE POLICY lig_select ON commande_lignes FOR SELECT TO authenticated
  USING (imprimerie_id = public.my_imprimerie());

CREATE POLICY lig_write_comptoir ON commande_lignes FOR ALL TO authenticated
  USING (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id))
  WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id));

-- >>>>>> migrations/004_paiements.sql
-- =====================================================================
-- GestiPrint — Migration 004 : Paiements (registre IMMUABLE)
-- =====================================================================
-- Patron repris de GestiEcole (mig 010) : un paiement ne se supprime jamais,
-- il s'ANNULE (trace conservée). Le taux de change est FIGÉ au paiement (report
-- USD/caisse). Reçu séquentiel par imprimerie. Règle métier :
--   - un paiement est saisi dans la DEVISE DE LA COMMANDE (solde exact) ;
--   - `taux` = unités locales pour 1 USD au moment du paiement (NULL si USD) ;
--   - `montant_usd` (généré) sert au report multi-devises et à la caisse ;
--   - solde = montant_total − Σ(paiements non annulés)  → toujours CALCULÉ.
-- Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS paiements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imprimerie_id UUID NOT NULL DEFAULT public.my_imprimerie() REFERENCES imprimerie(id) ON DELETE CASCADE,
  commande_id   UUID NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,   -- dénormalisé (solde client rapide)
  sens          VARCHAR(10) NOT NULL DEFAULT 'acompte' CHECK (sens IN ('acompte', 'solde', 'paiement')),
  montant       NUMERIC(12,2) NOT NULL CHECK (montant > 0),
  devise        VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (devise IN ('USD', 'FC', 'BIF')),
  taux          NUMERIC(12,4),                                    -- figé : locale pour 1 USD (NULL si USD)
  montant_usd   NUMERIC(12,2) GENERATED ALWAYS AS
                (CASE WHEN devise = 'USD' THEN montant
                      ELSE ROUND(montant / NULLIF(taux, 0), 2) END) STORED,
  mode          VARCHAR(12) NOT NULL DEFAULT 'especes'
                CHECK (mode IN ('especes', 'airtel', 'orange', 'mpesa', 'banque', 'autre')),
  date_paiement DATE NOT NULL DEFAULT CURRENT_DATE,
  recu_numero   VARCHAR(20),
  encaisse_par  UUID DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  annule        BOOLEAN NOT NULL DEFAULT FALSE,
  annule_motif  VARCHAR(200),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_paiements_imprimerie ON paiements(imprimerie_id);
CREATE INDEX IF NOT EXISTS idx_paiements_commande   ON paiements(commande_id);
CREATE INDEX IF NOT EXISTS idx_paiements_client     ON paiements(client_id);
CREATE INDEX IF NOT EXISTS idx_paiements_date       ON paiements(imprimerie_id, date_paiement);

-- ---------------------------------------------------------------------
-- Reçu séquentiel par imprimerie (réutilise compteurs / next_numero de la mig 003)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_recu_numero()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.recu_numero IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.imprimerie_id IS NULL THEN NEW.imprimerie_id := public.my_imprimerie(); END IF;
  NEW.recu_numero := 'REC-' || LPAD(public.next_numero(NEW.imprimerie_id, 'recu')::text, 6, '0');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_recu_numero ON paiements;
CREATE TRIGGER trg_recu_numero BEFORE INSERT ON paiements
  FOR EACH ROW EXECUTE FUNCTION public.assign_recu_numero();

-- ---------------------------------------------------------------------
-- IMMUABILITÉ : après création, seuls `annule` et `annule_motif` peuvent
-- changer (annulation). Toute autre modification est refusée ; la suppression
-- est bloquée par l'absence de policy DELETE.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.paiements_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.id, NEW.imprimerie_id, NEW.commande_id, NEW.montant, NEW.devise,
      COALESCE(NEW.taux, -1), NEW.mode, NEW.date_paiement, NEW.recu_numero)
     IS DISTINCT FROM
     (OLD.id, OLD.imprimerie_id, OLD.commande_id, OLD.montant, OLD.devise,
      COALESCE(OLD.taux, -1), OLD.mode, OLD.date_paiement, OLD.recu_numero) THEN
    RAISE EXCEPTION 'Un paiement est immuable : seule son annulation est permise.';
  END IF;
  IF OLD.annule = TRUE AND NEW.annule = FALSE THEN
    RAISE EXCEPTION 'Un paiement annulé ne peut être réactivé.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_paiements_immutable ON paiements;
CREATE TRIGGER trg_paiements_immutable BEFORE UPDATE ON paiements
  FOR EACH ROW EXECUTE FUNCTION public.paiements_immutable();

-- ---------------------------------------------------------------------
-- RLS : lecture + encaissement par le comptoir (proprietaire/agent) ;
-- l'annulation (UPDATE) est réservée au PROPRIÉTAIRE. Aucune policy DELETE.
-- ---------------------------------------------------------------------
ALTER TABLE paiements ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='paiements'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.paiements', r.policyname); END LOOP;
END $$;

CREATE POLICY pmt_select ON paiements FOR SELECT TO authenticated
  USING (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent'));

CREATE POLICY pmt_insert ON paiements FOR INSERT TO authenticated
  WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id));

CREATE POLICY pmt_cancel ON paiements FOR UPDATE TO authenticated
  USING (imprimerie_id = public.my_imprimerie() AND public.my_role() = 'proprietaire' AND public.imprimerie_active(imprimerie_id))
  WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.my_role() = 'proprietaire');

-- >>>>>> migrations/005_depenses.sql
-- =====================================================================
-- GestiPrint — Migration 005 : Dépenses (sorties de caisse) — append-only
-- =====================================================================
-- Miroir des paiements : multi-devises, taux figé, montant_usd calculé, bon
-- séquentiel par imprimerie (réutilise compteurs/next_numero). On ne modifie
-- jamais une écriture — on l'ANNULE (trace conservée), puis on re-saisit.
-- La CAISSE (recettes − dépenses) est calculée à la lecture : recettes =
-- paiements non annulés, dépenses = cette table. Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS depenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imprimerie_id UUID NOT NULL DEFAULT public.my_imprimerie() REFERENCES imprimerie(id) ON DELETE CASCADE,
  categorie     VARCHAR(20) NOT NULL CHECK (categorie IN (
                  'fournitures', 'encre_papier', 'salaires', 'loyer', 'energie',
                  'transport', 'maintenance', 'banque', 'taxes', 'communication', 'divers')),
  libelle       VARCHAR(200) NOT NULL,
  beneficiaire  VARCHAR(160),
  montant       NUMERIC(12,2) NOT NULL CHECK (montant > 0),
  devise        VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (devise IN ('USD', 'FC', 'BIF')),
  taux          NUMERIC(12,4),                                   -- figé : locale pour 1 USD (NULL si USD)
  montant_usd   NUMERIC(12,2) GENERATED ALWAYS AS
                (CASE WHEN devise = 'USD' THEN montant
                      ELSE ROUND(montant / NULLIF(taux, 0), 2) END) STORED,
  date_depense  DATE NOT NULL DEFAULT CURRENT_DATE,
  mode          VARCHAR(12) NOT NULL DEFAULT 'especes'
                CHECK (mode IN ('especes', 'airtel', 'orange', 'mpesa', 'banque', 'autre')),
  reference     VARCHAR(60),
  bon_numero    VARCHAR(20),
  enregistre_par UUID DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  annule        BOOLEAN NOT NULL DEFAULT FALSE,
  annule_motif  VARCHAR(200),
  annule_par    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  annule_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_depenses_imprimerie ON depenses(imprimerie_id);
CREATE INDEX IF NOT EXISTS idx_depenses_date       ON depenses(imprimerie_id, date_depense);

-- Bon de sortie séquentiel (réutilise compteurs / next_numero de la mig 003).
CREATE OR REPLACE FUNCTION public.assign_bon_numero()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.bon_numero IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.imprimerie_id IS NULL THEN NEW.imprimerie_id := public.my_imprimerie(); END IF;
  NEW.bon_numero := 'DEP-' || LPAD(public.next_numero(NEW.imprimerie_id, 'depense')::text, 6, '0');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_bon_numero ON depenses;
CREATE TRIGGER trg_bon_numero BEFORE INSERT ON depenses
  FOR EACH ROW EXECUTE FUNCTION public.assign_bon_numero();

-- APPEND-ONLY : seule l'annulation est permise ; une écriture annulée est figée.
CREATE OR REPLACE FUNCTION public.depense_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.annule THEN
    RAISE EXCEPTION 'Écriture déjà annulée : elle ne peut plus être modifiée.';
  END IF;
  IF (NEW.montant, NEW.devise, COALESCE(NEW.taux,-1), NEW.categorie, NEW.libelle,
      COALESCE(NEW.beneficiaire,''), NEW.date_depense, NEW.mode, COALESCE(NEW.reference,''), NEW.bon_numero)
     IS DISTINCT FROM
     (OLD.montant, OLD.devise, COALESCE(OLD.taux,-1), OLD.categorie, OLD.libelle,
      COALESCE(OLD.beneficiaire,''), OLD.date_depense, OLD.mode, COALESCE(OLD.reference,''), OLD.bon_numero) THEN
    RAISE EXCEPTION 'Modification interdite : annulez cette écriture puis re-saisissez-la (contre-écriture).';
  END IF;
  IF NEW.annule AND NOT OLD.annule THEN
    NEW.annule_at := NOW();
    NEW.annule_par := auth.uid();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_depense_append_only ON depenses;
CREATE TRIGGER trg_depense_append_only BEFORE UPDATE ON depenses
  FOR EACH ROW EXECUTE FUNCTION public.depense_append_only();

-- RLS : comptoir (proprietaire/agent) lit/saisit/annule ; aucune suppression.
ALTER TABLE depenses ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='depenses'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.depenses', r.policyname); END LOOP;
END $$;

CREATE POLICY dep_select ON depenses FOR SELECT TO authenticated
  USING (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent'));
CREATE POLICY dep_insert ON depenses FOR INSERT TO authenticated
  WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id));
CREATE POLICY dep_cancel ON depenses FOR UPDATE TO authenticated
  USING (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id))
  WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent'));

-- >>>>>> migrations/006_rapports.sql
-- =====================================================================
-- GestiPrint — Migration 006 : date de livraison (pour les rapports)
-- =====================================================================
-- Le CHIFFRE D'AFFAIRES est reconnu À LA LIVRAISON, pas à l'encaissement.
-- Pour l'agréger par période, on horodate le passage au statut 'livree' via un
-- trigger (côté serveur → fiable même quand le changement de statut a été fait
-- hors ligne puis synchronisé). Idempotent.
-- =====================================================================

ALTER TABLE commandes ADD COLUMN IF NOT EXISTS livree_le DATE;
CREATE INDEX IF NOT EXISTS idx_commandes_livree ON commandes(imprimerie_id, livree_le);

CREATE OR REPLACE FUNCTION public.commandes_livree_date()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.statut = 'livree' THEN
    -- Fixe la date à la 1ère livraison ; ne l'écrase pas si déjà posée.
    IF NEW.livree_le IS NULL THEN NEW.livree_le := CURRENT_DATE; END IF;
  ELSE
    -- Retour à un statut non livré (ex. correction) → on efface la date.
    NEW.livree_le := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_commandes_livree ON commandes;
CREATE TRIGGER trg_commandes_livree
  BEFORE INSERT OR UPDATE ON commandes
  FOR EACH ROW EXECUTE FUNCTION public.commandes_livree_date();

-- Rattrapage : les commandes déjà livrées avant cette migration reçoivent une
-- date (faute de mieux : leur date de création) pour ne pas disparaître du CA.
UPDATE commandes SET livree_le = created_at::date
 WHERE statut = 'livree' AND livree_le IS NULL;

-- >>>>>> migrations/007_stock.sql
-- =====================================================================
-- GestiPrint — Migration 007 : Stock (consommables d'imprimerie)
-- =====================================================================
-- Articles (papier, encre, toner, bâche, vinyle, carton, textile…) + registre
-- de mouvements. Le stock actuel est MAINTENU par trigger à partir des
-- mouvements (entrée +, sortie −, ajustement = delta signé) → cohérence garantie
-- (Σ mouvements.quantite = stock_actuel). Seuil minimum → alertes de réappro.
-- Multi-tenant + RLS. Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS stock_articles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imprimerie_id UUID NOT NULL DEFAULT public.my_imprimerie() REFERENCES imprimerie(id) ON DELETE CASCADE,
  nom           VARCHAR(160) NOT NULL,
  categorie     VARCHAR(20) NOT NULL DEFAULT 'consommable' CHECK (categorie IN (
                  'papier', 'encre', 'toner', 'bache', 'vinyle', 'carton',
                  'textile', 'plaque', 'film', 'consommable', 'autre')),
  unite         VARCHAR(20) NOT NULL DEFAULT 'pièce',      -- feuille, ramette, ml, litre, m², m, rouleau, pièce…
  stock_actuel  NUMERIC(14,2) NOT NULL DEFAULT 0,          -- maintenu par trigger
  seuil_min     NUMERIC(14,2) NOT NULL DEFAULT 0,          -- 0 = pas d'alerte
  prix_unitaire NUMERIC(12,2),                             -- coût indicatif (optionnel)
  devise        VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (devise IN ('USD', 'FC', 'BIF')),
  actif         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_art_imprimerie ON stock_articles(imprimerie_id);
CREATE INDEX IF NOT EXISTS idx_stock_art_cat ON stock_articles(imprimerie_id, categorie);

CREATE TABLE IF NOT EXISTS stock_mouvements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imprimerie_id UUID NOT NULL DEFAULT public.my_imprimerie() REFERENCES imprimerie(id) ON DELETE CASCADE,
  article_id    UUID NOT NULL REFERENCES stock_articles(id) ON DELETE CASCADE,
  type          VARCHAR(12) NOT NULL CHECK (type IN ('entree', 'sortie', 'ajustement')),
  quantite      NUMERIC(14,2) NOT NULL,                    -- delta SIGNÉ réellement appliqué au stock
  motif         VARCHAR(200),
  commande_id   UUID REFERENCES commandes(id) ON DELETE SET NULL,  -- consommation liée (optionnel)
  cree_par      UUID DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_mvt_article ON stock_mouvements(article_id);
CREATE INDEX IF NOT EXISTS idx_stock_mvt_imprimerie ON stock_mouvements(imprimerie_id, created_at);

-- Le stock actuel suit les mouvements (SECURITY DEFINER : met à jour l'article
-- même si l'appelant n'a pas de droit direct dessus).
CREATE OR REPLACE FUNCTION public.stock_apply_mouvement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.imprimerie_id IS NULL THEN NEW.imprimerie_id := public.my_imprimerie(); END IF;
  UPDATE public.stock_articles
     SET stock_actuel = stock_actuel + NEW.quantite
   WHERE id = NEW.article_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stock_mouvement ON stock_mouvements;
CREATE TRIGGER trg_stock_mouvement AFTER INSERT ON stock_mouvements
  FOR EACH ROW EXECUTE FUNCTION public.stock_apply_mouvement();

-- ---------------------------------------------------------------------
-- RLS : lecture = tout le personnel ; écriture (articles + mouvements) =
-- propriétaire + comptoir (agent), abonnement actif.
-- ---------------------------------------------------------------------
ALTER TABLE stock_articles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_mouvements ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname='public' AND tablename IN ('stock_articles','stock_mouvements')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename); END LOOP;
END $$;

CREATE POLICY sa_select ON stock_articles FOR SELECT TO authenticated
  USING (imprimerie_id = public.my_imprimerie());
CREATE POLICY sa_write ON stock_articles FOR ALL TO authenticated
  USING (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id))
  WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id));

CREATE POLICY sm_select ON stock_mouvements FOR SELECT TO authenticated
  USING (imprimerie_id = public.my_imprimerie());
CREATE POLICY sm_insert ON stock_mouvements FOR INSERT TO authenticated
  WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id));

-- >>>>>> migrations/008_fournisseurs.sql
-- =====================================================================
-- GestiPrint — Migration 008 : Fournisseurs & Réapprovisionnement
-- =====================================================================
-- Miroir « côté achats » du couple clients/commandes :
--   fournisseurs → achats (+ lignes) → achat_paiements (registre immuable).
-- Dette fournisseur = Σ achats (non annulés) − Σ paiements (non annulés).
-- La RÉCEPTION d'un achat génère les entrées de stock (appliquée côté app avec
-- le garde `stock_applique` pour ne jamais compter deux fois). Idempotent.
-- =====================================================================

-- 1) FOURNISSEURS -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS fournisseurs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imprimerie_id UUID NOT NULL DEFAULT public.my_imprimerie() REFERENCES imprimerie(id) ON DELETE CASCADE,
  nom           VARCHAR(160) NOT NULL,
  telephone     VARCHAR(30),
  email         VARCHAR(150),
  adresse       VARCHAR(200),
  note          TEXT,
  actif         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fourn_imprimerie ON fournisseurs(imprimerie_id);

-- 2) ACHATS (réappro) -------------------------------------------------------
CREATE TABLE IF NOT EXISTS achats (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imprimerie_id  UUID NOT NULL DEFAULT public.my_imprimerie() REFERENCES imprimerie(id) ON DELETE CASCADE,
  numero         INT,
  fournisseur_id UUID REFERENCES fournisseurs(id) ON DELETE SET NULL,
  date_achat     DATE NOT NULL DEFAULT CURRENT_DATE,
  statut         VARCHAR(12) NOT NULL DEFAULT 'commande' CHECK (statut IN ('commande', 'recu', 'annule')),
  devise         VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (devise IN ('USD', 'FC', 'BIF')),
  montant_total  NUMERIC(12,2) NOT NULL DEFAULT 0,
  note           TEXT,
  stock_applique BOOLEAN NOT NULL DEFAULT FALSE,   -- vrai une fois les entrées stock générées
  created_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_achats_imprimerie ON achats(imprimerie_id);
CREATE INDEX IF NOT EXISTS idx_achats_fourn ON achats(fournisseur_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_achats_numero ON achats(imprimerie_id, numero);

CREATE OR REPLACE FUNCTION public.achats_set_numero()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.numero IS NULL THEN NEW.numero := public.next_numero(NEW.imprimerie_id, 'achat'); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_achats_numero ON achats;
CREATE TRIGGER trg_achats_numero BEFORE INSERT ON achats
  FOR EACH ROW EXECUTE FUNCTION public.achats_set_numero();

-- 3) LIGNES D'ACHAT (liées ou non à un article de stock) --------------------
CREATE TABLE IF NOT EXISTS achat_lignes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imprimerie_id UUID NOT NULL DEFAULT public.my_imprimerie() REFERENCES imprimerie(id) ON DELETE CASCADE,
  achat_id      UUID NOT NULL REFERENCES achats(id) ON DELETE CASCADE,
  article_id    UUID REFERENCES stock_articles(id) ON DELETE SET NULL,   -- NULL = ligne libre (non stockée)
  designation   VARCHAR(300) NOT NULL,
  quantite      NUMERIC(14,2) NOT NULL DEFAULT 1,
  prix_unitaire NUMERIC(12,2) NOT NULL DEFAULT 0,
  montant       NUMERIC(12,2) NOT NULL DEFAULT 0,
  position      INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_achat_lignes_achat ON achat_lignes(achat_id);

-- 4) PAIEMENTS FOURNISSEURS (registre immuable) -----------------------------
CREATE TABLE IF NOT EXISTS achat_paiements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imprimerie_id  UUID NOT NULL DEFAULT public.my_imprimerie() REFERENCES imprimerie(id) ON DELETE CASCADE,
  achat_id       UUID NOT NULL REFERENCES achats(id) ON DELETE CASCADE,
  fournisseur_id UUID REFERENCES fournisseurs(id) ON DELETE SET NULL,
  montant        NUMERIC(12,2) NOT NULL CHECK (montant > 0),
  devise         VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (devise IN ('USD', 'FC', 'BIF')),
  taux           NUMERIC(12,4),
  montant_usd    NUMERIC(12,2) GENERATED ALWAYS AS
                 (CASE WHEN devise = 'USD' THEN montant ELSE ROUND(montant / NULLIF(taux, 0), 2) END) STORED,
  mode           VARCHAR(12) NOT NULL DEFAULT 'especes' CHECK (mode IN ('especes','airtel','orange','mpesa','banque','autre')),
  date_paiement  DATE NOT NULL DEFAULT CURRENT_DATE,
  recu_numero    VARCHAR(20),
  regle_par      UUID DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  annule         BOOLEAN NOT NULL DEFAULT FALSE,
  annule_motif   VARCHAR(200),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_achatpaie_achat ON achat_paiements(achat_id);
CREATE INDEX IF NOT EXISTS idx_achatpaie_fourn ON achat_paiements(fournisseur_id);

CREATE OR REPLACE FUNCTION public.assign_paie_fourn_numero()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.recu_numero IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.imprimerie_id IS NULL THEN NEW.imprimerie_id := public.my_imprimerie(); END IF;
  NEW.recu_numero := 'PA-' || LPAD(public.next_numero(NEW.imprimerie_id, 'achat_paie')::text, 6, '0');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_paie_fourn_numero ON achat_paiements;
CREATE TRIGGER trg_paie_fourn_numero BEFORE INSERT ON achat_paiements
  FOR EACH ROW EXECUTE FUNCTION public.assign_paie_fourn_numero();

CREATE OR REPLACE FUNCTION public.achat_paie_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.montant, NEW.devise, COALESCE(NEW.taux,-1), NEW.mode, NEW.date_paiement, NEW.recu_numero, NEW.achat_id)
     IS DISTINCT FROM
     (OLD.montant, OLD.devise, COALESCE(OLD.taux,-1), OLD.mode, OLD.date_paiement, OLD.recu_numero, OLD.achat_id) THEN
    RAISE EXCEPTION 'Un paiement fournisseur est immuable : seule son annulation est permise.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_achat_paie_immutable ON achat_paiements;
CREATE TRIGGER trg_achat_paie_immutable BEFORE UPDATE ON achat_paiements
  FOR EACH ROW EXECUTE FUNCTION public.achat_paie_immutable();

-- 5) RLS --------------------------------------------------------------------
ALTER TABLE fournisseurs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE achats          ENABLE ROW LEVEL SECURITY;
ALTER TABLE achat_lignes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE achat_paiements ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname='public' AND tablename IN ('fournisseurs','achats','achat_lignes','achat_paiements')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename); END LOOP;
END $$;

-- Lecture = tout le personnel ; écriture = propriétaire + comptoir, si actif.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fournisseurs','achats','achat_lignes'] LOOP
    EXECUTE format($f$CREATE POLICY %1$s_select ON %1$s FOR SELECT TO authenticated USING (imprimerie_id = public.my_imprimerie())$f$, t);
    EXECUTE format($f$CREATE POLICY %1$s_write ON %1$s FOR ALL TO authenticated
      USING (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id))
      WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id))$f$, t);
  END LOOP;
END $$;

-- Paiements fournisseurs : lecture staff, insert comptoir, annulation propriétaire, pas de suppression.
CREATE POLICY afp_select ON achat_paiements FOR SELECT TO authenticated
  USING (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent'));
CREATE POLICY afp_insert ON achat_paiements FOR INSERT TO authenticated
  WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id));
CREATE POLICY afp_cancel ON achat_paiements FOR UPDATE TO authenticated
  USING (imprimerie_id = public.my_imprimerie() AND public.my_role() = 'proprietaire' AND public.imprimerie_active(imprimerie_id))
  WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.my_role() = 'proprietaire');

-- >>>>>> migrations/009_portail.sql
-- =====================================================================
-- GestiPrint — Migration 009 : Portail client public (demandes de commande)
-- =====================================================================
-- Un client peut, depuis un lien public /commander/<imprimerie_id>, envoyer une
-- DEMANDE de commande sans compte. Elle atterrit dans une boîte de réception que
-- le comptoir convertit en vraie commande. Insertion anonyme autorisée (la clé
-- FK garantit une imprimerie valide) ; lecture/traitement réservés au personnel.
-- Idempotent.
-- =====================================================================

-- Vue publique : expose UNIQUEMENT des champs non sensibles de l'imprimerie
-- (pour afficher le nom sur le formulaire public). Vue « definer » → contourne la
-- RLS de `imprimerie` mais ne révèle que ces colonnes.
CREATE OR REPLACE VIEW public.imprimerie_public AS
  SELECT id, nom, ville, telephone, logo_url FROM public.imprimerie;
GRANT SELECT ON public.imprimerie_public TO anon, authenticated;

CREATE TABLE IF NOT EXISTS demandes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imprimerie_id    UUID NOT NULL REFERENCES imprimerie(id) ON DELETE CASCADE,
  client_nom       VARCHAR(160) NOT NULL,
  client_telephone VARCHAR(30),
  client_email     VARCHAR(150),
  description      TEXT NOT NULL,
  statut           VARCHAR(12) NOT NULL DEFAULT 'nouvelle' CHECK (statut IN ('nouvelle', 'vue', 'convertie', 'refusee')),
  commande_id      UUID REFERENCES commandes(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_demandes_imprimerie ON demandes(imprimerie_id, statut);

ALTER TABLE demandes ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='demandes'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.demandes', r.policyname); END LOOP;
END $$;

-- Insertion publique (anonyme ou connecté). La FK imprimerie_id empêche les
-- tenants invalides ; le statut est forcé à 'nouvelle'.
CREATE POLICY dem_insert ON demandes FOR INSERT TO anon, authenticated
  WITH CHECK (imprimerie_id IS NOT NULL AND statut = 'nouvelle' AND commande_id IS NULL);

-- Lecture / traitement : personnel comptoir de l'imprimerie.
CREATE POLICY dem_select ON demandes FOR SELECT TO authenticated
  USING (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent'));
CREATE POLICY dem_update ON demandes FOR UPDATE TO authenticated
  USING (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent'))
  WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent'));

-- Privilèges de table (la RLS filtre les lignes, mais PostgREST exige aussi le GRANT).
GRANT INSERT ON public.demandes TO anon, authenticated;
GRANT SELECT, UPDATE ON public.demandes TO authenticated;
