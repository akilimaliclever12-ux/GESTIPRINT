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
