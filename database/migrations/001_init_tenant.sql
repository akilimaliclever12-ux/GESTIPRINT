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
