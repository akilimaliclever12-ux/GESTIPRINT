-- =====================================================================
-- GestiPrint — Migration 012 : étapes de production détaillées, durée de
-- production, et champ entreprise (suite au questionnaire Aston Group)
-- =====================================================================
-- Étapes : nouvelle → conception → validation → impression → finition →
--          terminee (prête à récupérer) → livree (+ annulee).
-- Le stock se consomme désormais au passage en IMPRESSION (l'app pose le garde
-- stock_consomme). Durée de production = prod_fin_le − prod_debut_le. Idempotent.
-- =====================================================================

-- 1) Élargir la contrainte de statut des commandes.
DO $$
DECLARE cname TEXT;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
   WHERE conrelid = 'public.commandes'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%statut%';
  IF cname IS NOT NULL THEN EXECUTE 'ALTER TABLE public.commandes DROP CONSTRAINT ' || quote_ident(cname); END IF;
  ALTER TABLE public.commandes ADD CONSTRAINT commandes_statut_chk
    CHECK (statut IN ('nouvelle', 'conception', 'validation', 'impression', 'finition', 'terminee', 'livree', 'annulee'));
END $$;

-- 2) Dates de production (pour la durée).
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS prod_debut_le DATE;
ALTER TABLE commandes ADD COLUMN IF NOT EXISTS prod_fin_le   DATE;

-- 3) Champ entreprise sur le client (Q9).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS entreprise VARCHAR(160);

-- 4) Horodatage automatique des jalons de production (remplace la fonction de la
--    migration 006 en l'étendant : début de prod, fin de prod, livraison).
CREATE OR REPLACE FUNCTION public.commandes_livree_date()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Début de production : 1ère fois qu'on entre dans une étape de fabrication.
  IF NEW.statut IN ('conception', 'validation', 'impression', 'finition', 'terminee', 'livree')
     AND NEW.prod_debut_le IS NULL THEN
    NEW.prod_debut_le := CURRENT_DATE;
  END IF;
  -- Fin de production : commande prête (terminée) ou livrée.
  IF NEW.statut IN ('terminee', 'livree') AND NEW.prod_fin_le IS NULL THEN
    NEW.prod_fin_le := CURRENT_DATE;
  END IF;
  -- Date de livraison (comme avant) : posée à la livraison, effacée si on revient en arrière.
  IF NEW.statut = 'livree' THEN
    IF NEW.livree_le IS NULL THEN NEW.livree_le := CURRENT_DATE; END IF;
  ELSE
    NEW.livree_le := NULL;
  END IF;
  RETURN NEW;
END $$;
-- Le trigger trg_commandes_livree (mig 006) appelle déjà cette fonction.
