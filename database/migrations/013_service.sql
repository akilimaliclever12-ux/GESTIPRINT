-- =====================================================================
-- GestiPrint — Migration 013 : catégorie « service » sur la commande
-- =====================================================================
-- Permet de regrouper le chiffre d'affaires PAR SERVICE dans les rapports
-- (Q37 : « chaque service doit nous montrer le bénéfice »). Champ libre parmi
-- une liste suggérée côté app (impression, t-shirt, photocopie, design…).
-- Idempotent.
-- =====================================================================

ALTER TABLE commandes ADD COLUMN IF NOT EXISTS service VARCHAR(40);
CREATE INDEX IF NOT EXISTS idx_commandes_service ON commandes(imprimerie_id, service);
