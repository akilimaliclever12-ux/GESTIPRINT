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
