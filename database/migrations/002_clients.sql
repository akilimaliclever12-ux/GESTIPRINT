-- =====================================================================
-- GestiPrint — Migration 002 : Clients
-- =====================================================================
-- Table des clients de l'imprimerie. Multi-tenant (imprimerie_id auto),
-- cloisonnée par RLS, écritures bloquées si l'abonnement est expiré.
-- Le SOLDE DÛ d'un client n'est PAS stocké ici : il sera calculé à partir des
-- commandes et paiements (S3/S4) — argent reçu ≠ CA, solde toujours dérivé.
-- Idempotent.
-- =====================================================================

-- Helper réutilisable : le rôle de l'utilisateur connecté.
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE TABLE IF NOT EXISTS clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imprimerie_id UUID NOT NULL DEFAULT public.my_imprimerie() REFERENCES imprimerie(id) ON DELETE CASCADE,
  nom           VARCHAR(160) NOT NULL,
  telephone     VARCHAR(30),
  email         VARCHAR(150),
  adresse       VARCHAR(200),
  note          TEXT,
  actif         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_imprimerie ON clients(imprimerie_id);
CREATE INDEX IF NOT EXISTS idx_clients_nom ON clients(imprimerie_id, nom);

-- ---------------------------------------------------------------------
-- RLS : lecture pour tout le personnel de l'imprimerie ; écriture pour
-- propriétaire + comptoir (agent), et seulement si l'abonnement est actif.
-- L'opérateur (production) est en lecture seule sur les clients.
-- ---------------------------------------------------------------------
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'clients'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.clients', r.policyname);
  END LOOP;
END $$;

CREATE POLICY c_clients_select ON clients FOR SELECT TO authenticated
  USING (imprimerie_id = public.my_imprimerie());

CREATE POLICY c_clients_write ON clients FOR ALL TO authenticated
  USING (
    imprimerie_id = public.my_imprimerie()
    AND public.my_role() IN ('proprietaire', 'agent')
    AND public.imprimerie_active(imprimerie_id)
  )
  WITH CHECK (
    imprimerie_id = public.my_imprimerie()
    AND public.my_role() IN ('proprietaire', 'agent')
    AND public.imprimerie_active(imprimerie_id)
  );
