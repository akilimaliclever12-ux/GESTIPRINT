-- =====================================================================
-- GestiPrint — Migration 010 : stockage du logo de l'imprimerie
-- =====================================================================
-- Bucket public `logos`. Chaque imprimerie n'écrit que dans son dossier
-- (préfixe = son id) ; lecture publique (URL directe) pour l'affichage sur les
-- reçus et le portail. Seul le PROPRIÉTAIRE peut téléverser. Idempotent.
-- =====================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Politiques sur storage.objects (écriture cloisonnée par imprimerie).
DROP POLICY IF EXISTS logos_insert ON storage.objects;
DROP POLICY IF EXISTS logos_update ON storage.objects;
DROP POLICY IF EXISTS logos_delete ON storage.objects;
DROP POLICY IF EXISTS logos_read   ON storage.objects;

CREATE POLICY logos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = public.my_imprimerie()::text
    AND public.my_role() = 'proprietaire'
  );
CREATE POLICY logos_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'logos' AND (storage.foldername(name))[1] = public.my_imprimerie()::text AND public.my_role() = 'proprietaire')
  WITH CHECK (bucket_id = 'logos' AND (storage.foldername(name))[1] = public.my_imprimerie()::text AND public.my_role() = 'proprietaire');
CREATE POLICY logos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'logos' AND (storage.foldername(name))[1] = public.my_imprimerie()::text AND public.my_role() = 'proprietaire');

-- Lecture : le bucket étant public, les fichiers sont servis via URL publique.
-- On autorise aussi le SELECT (listing) à tous, sans risque (bucket public).
CREATE POLICY logos_read ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'logos');
