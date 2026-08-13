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
