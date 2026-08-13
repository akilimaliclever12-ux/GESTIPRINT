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
