-- =====================================================================
-- GestiPrint — Migration 006 : date de livraison (pour les rapports)
-- =====================================================================
-- Le CHIFFRE D'AFFAIRES est reconnu À LA LIVRAISON, pas à l'encaissement.
-- Pour l'agréger par période, on horodate le passage au statut 'livree' via un
-- trigger (côté serveur → fiable même quand le changement de statut a été fait
-- hors ligne puis synchronisé). Idempotent.
-- =====================================================================

ALTER TABLE commandes ADD COLUMN IF NOT EXISTS livree_le DATE;
CREATE INDEX IF NOT EXISTS idx_commandes_livree ON commandes(imprimerie_id, livree_le);

CREATE OR REPLACE FUNCTION public.commandes_livree_date()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.statut = 'livree' THEN
    -- Fixe la date à la 1ère livraison ; ne l'écrase pas si déjà posée.
    IF NEW.livree_le IS NULL THEN NEW.livree_le := CURRENT_DATE; END IF;
  ELSE
    -- Retour à un statut non livré (ex. correction) → on efface la date.
    NEW.livree_le := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_commandes_livree ON commandes;
CREATE TRIGGER trg_commandes_livree
  BEFORE INSERT OR UPDATE ON commandes
  FOR EACH ROW EXECUTE FUNCTION public.commandes_livree_date();

-- Rattrapage : les commandes déjà livrées avant cette migration reçoivent une
-- date (faute de mieux : leur date de création) pour ne pas disparaître du CA.
UPDATE commandes SET livree_le = created_at::date
 WHERE statut = 'livree' AND livree_le IS NULL;
