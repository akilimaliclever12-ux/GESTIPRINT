-- =====================================================================
-- GestiPrint — Migration 011 : consommation du stock à la production
-- =====================================================================
-- Une ligne de commande peut être reliée à un article de stock avec la quantité
-- consommée (`qte_stock`). Au passage de la commande EN PRODUCTION, l'app génère
-- les sorties de stock correspondantes (une seule fois, garde `stock_consomme`).
-- Idempotent.
-- =====================================================================

ALTER TABLE commande_lignes ADD COLUMN IF NOT EXISTS article_id UUID REFERENCES stock_articles(id) ON DELETE SET NULL;
ALTER TABLE commande_lignes ADD COLUMN IF NOT EXISTS qte_stock  NUMERIC(14,2);
ALTER TABLE commandes       ADD COLUMN IF NOT EXISTS stock_consomme BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_cmd_lignes_article ON commande_lignes(article_id);
