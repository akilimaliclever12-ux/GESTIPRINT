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
