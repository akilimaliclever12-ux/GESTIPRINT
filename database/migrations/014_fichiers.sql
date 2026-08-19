-- =====================================================================
-- GestiPrint — Migration 014 : fichiers joints aux commandes (Q24-25)
-- =====================================================================
-- Le client envoie des designs / livres : on les attache à la commande.
-- Bucket PRIVÉ `fichiers` (accès par URL signée), cloisonné par imprimerie.
-- Métadonnées dans `commande_fichiers`. Conservation ~1 an = à purger plus tard
-- (tâche planifiée), non bloquant. Idempotent.
-- =====================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('fichiers', 'fichiers', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS fichiers_select ON storage.objects;
DROP POLICY IF EXISTS fichiers_insert ON storage.objects;
DROP POLICY IF EXISTS fichiers_delete ON storage.objects;

CREATE POLICY fichiers_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fichiers' AND (storage.foldername(name))[1] = public.my_imprimerie()::text);
CREATE POLICY fichiers_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fichiers' AND (storage.foldername(name))[1] = public.my_imprimerie()::text AND public.my_role() IN ('proprietaire','agent'));
CREATE POLICY fichiers_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fichiers' AND (storage.foldername(name))[1] = public.my_imprimerie()::text AND public.my_role() IN ('proprietaire','agent'));

CREATE TABLE IF NOT EXISTS commande_fichiers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imprimerie_id UUID NOT NULL DEFAULT public.my_imprimerie() REFERENCES imprimerie(id) ON DELETE CASCADE,
  commande_id   UUID NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  nom           VARCHAR(255) NOT NULL,
  path          TEXT NOT NULL,
  taille        BIGINT,
  type          VARCHAR(120),
  cree_par      UUID DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cmd_fichiers_commande ON commande_fichiers(commande_id);

ALTER TABLE commande_fichiers ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='commande_fichiers'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.commande_fichiers', r.policyname); END LOOP;
END $$;
CREATE POLICY cf_select ON commande_fichiers FOR SELECT TO authenticated
  USING (imprimerie_id = public.my_imprimerie());
CREATE POLICY cf_write ON commande_fichiers FOR ALL TO authenticated
  USING (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id))
  WITH CHECK (imprimerie_id = public.my_imprimerie() AND public.my_role() IN ('proprietaire','agent') AND public.imprimerie_active(imprimerie_id));
