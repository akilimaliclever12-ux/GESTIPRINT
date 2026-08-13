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
