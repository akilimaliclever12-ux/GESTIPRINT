-- =====================================================================
-- GestiPrint — Migration 015 : machines & pannes (Q39 « machine en panne »)
-- =====================================================================
-- Suivi du parc machines et de leurs pannes (déclaration, résolution, coût).
-- Indicateur au tableau de bord + liste. Multi-tenant + RLS. Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS machines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imprimerie_id UUID NOT NULL DEFAULT public.my_imprimerie() REFERENCES imprimerie(id) ON DELETE CASCADE,
  nom           VARCHAR(160) NOT NULL,
  type          VARCHAR(80),
  actif         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_machines_imprimerie ON machines(imprimerie_id);

CREATE TABLE IF NOT EXISTS pannes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imprimerie_id UUID NOT NULL DEFAULT public.my_imprimerie() REFERENCES imprimerie(id) ON DELETE CASCADE,
  machine_id    UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  description   VARCHAR(300) NOT NULL,
  date_debut    DATE NOT NULL DEFAULT CURRENT_DATE,
  date_fin      DATE,
  resolu        BOOLEAN NOT NULL DEFAULT FALSE,
  cout          NUMERIC(12,2),
  devise        VARCHAR(3) DEFAULT 'USD' CHECK (devise IN ('USD','FC','BIF')),
  cree_par      UUID DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pannes_machine ON pannes(machine_id);
CREATE INDEX IF NOT EXISTS idx_pannes_ouvertes ON pannes(imprimerie_id, resolu);

ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pannes   ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename IN ('machines','pannes')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename); END LOOP;
END $$;

-- Machines : lecture staff, écriture comptoir.
CREATE POLICY m_select ON machines FOR SELECT TO authenticated USING (imprimerie_id = public.my_imprimerie());
CREATE POLICY m_write ON machines FOR ALL TO authenticated
  USING (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id))
  WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id));

-- Pannes : lecture staff, écriture par TOUT le personnel (l'opérateur déclare/résout).
CREATE POLICY p_select ON pannes FOR SELECT TO authenticated USING (imprimerie_id = public.my_imprimerie());
CREATE POLICY p_write ON pannes FOR ALL TO authenticated
  USING (imprimerie_id = public.my_imprimerie() AND public.imprimerie_active(imprimerie_id))
  WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.imprimerie_active(imprimerie_id));
