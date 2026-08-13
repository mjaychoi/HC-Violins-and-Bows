-- ============================================================
-- Consolidates the six-file update_instrument_sale_transition_atomic
-- transition originally drafted as
-- 20260423140001_update_instrument_sale_transition_revoke_public_old.sql
-- through
-- 20260423140006_update_instrument_sale_transition_grant_authenticated.sql
-- into one atomic migration.
--
-- Why: Supabase applies pending migrations in timestamp order and commits
-- each file to schema_migrations independently. Split across six files,
-- a deploy that stopped partway through the chain could permanently leave
-- one of several unsafe intermediate states applied:
--   - after file 1-2 alone: the six-argument function still exists but is
--     REVOKEd from PUBLIC/authenticated, i.e. callable by no one -- an
--     outage, not a security hole, but still an unintended halfway state;
--   - after file 3 alone: the six-argument function is dropped and no
--     replacement exists yet -- RPC callers get "function does not
--     exist";
--   - after file 4 alone: the new seven-argument function exists but has
--     not yet had its default PUBLIC EXECUTE privilege revoked -- briefly
--     callable by anyone, including anon, until files 5-6 land.
-- Folding all six steps into one migration file removes that window
-- entirely: Supabase applies each migration file as a single transaction,
-- so this file either fully applies or fully fails with no visible
-- intermediate state.
--
-- This migration is also written to converge safely regardless of which
-- of these signatures is already present in the catalog when it runs,
-- because production's live catalog currently contains the
-- seven-argument function despite these six migration versions being
-- unapplied there (out-of-band catalog drift, verified separately -- not
-- something this migration can detect, only something it must tolerate):
--   a. only the six-argument function present (the pre-transition /
--      00000000000037-39 baseline state);
--   b. only the seven-argument function present (e.g. the drifted
--      production catalog);
--   c. both signatures present simultaneously (Postgres allows function
--      overloading by argument count, so this is a real reachable state);
--   d. neither signature present (a fresh database that has never run
--      00000000000037 or any of this chain).
-- DROP FUNCTION IF EXISTS is a no-op when its target signature is absent,
-- and CREATE OR REPLACE FUNCTION creates the seven-argument function
-- fresh when absent or replaces its body in place when present, so all
-- four starting states converge on the same end state below.
--
-- The seven-argument function body is unchanged from
-- 20260423140004_update_instrument_sale_transition_atomic_concurrency.sql
-- (adds the p_expected_updated_at optimistic-concurrency parameter over
-- the six-argument baseline). Later migrations
-- (20260728153000_sale_transition_certificate_name.sql,
-- 20260804010000_enforce_sale_price_precision_and_maximum.sql,
-- 20260804020000_harden_sale_lifecycle_authorization.sql) already exist
-- unchanged in this repo and continue to CREATE OR REPLACE this same
-- seven-argument signature further; they are out of scope for this
-- consolidation.
--
-- Privileges are made explicit and unconditional rather than relying on
-- CREATE OR REPLACE's ACL-preservation behavior: REPLACE preserves
-- whatever privileges the target signature already had (which, for the
-- drifted production catalog, includes an EXECUTE grant callable by
-- anon -- REVOKE ... FROM PUBLIC alone does not remove anon's
-- explicit/default grant, since anon is a distinct role, not merely a
-- PUBLIC member for this purpose in this project's default-privilege
-- setup). So this migration always ends with an explicit REVOKE ALL FROM
-- PUBLIC, REVOKE ALL FROM anon, and GRANT EXECUTE TO authenticated on the
-- final seven-argument signature, regardless of what privileges it
-- entered this migration with.
-- ============================================================

-- Drop the six-argument signature if it is still present. No-ops
-- (including on the drifted-production and fresh-database states) when
-- it is not; safe to run whether or not files 1-2 of the original chain
-- ever separately revoked its PUBLIC/authenticated privileges first.
DROP FUNCTION IF EXISTS public.update_instrument_sale_transition_atomic(
  UUID, JSONB, NUMERIC, DATE, UUID, TEXT
);

CREATE OR REPLACE FUNCTION public.update_instrument_sale_transition_atomic(
  p_instrument_id UUID,
  p_patch         JSONB   DEFAULT '{}'::jsonb,
  p_sale_price    NUMERIC DEFAULT NULL,
  p_sale_date     DATE    DEFAULT NULL,
  p_client_id     UUID    DEFAULT NULL,
  p_sales_note    TEXT    DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.instruments
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id        UUID := public.org_id();
  v_current       public.instruments%ROWTYPE;
  v_result        public.instruments%ROWTYPE;
  v_next_status   TEXT;
  v_refund_source UUID;
BEGIN
  IF v_org_id IS NULL      THEN RAISE EXCEPTION 'Organization context required'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin role required'; END IF;

  SELECT * INTO v_current FROM public.instruments
  WHERE id = p_instrument_id AND org_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Instrument not found'; END IF;

  IF p_expected_updated_at IS NOT NULL THEN
    IF v_current.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'instrument_concurrency_conflict';
    END IF;
  END IF;

  v_next_status := COALESCE(NULLIF(p_patch->>'status', ''), v_current.status);

  IF v_current.status <> 'Sold' AND v_next_status = 'Sold' THEN
    IF p_sale_price IS NULL OR p_sale_price <= 0 THEN
      RAISE EXCEPTION 'Sale price must be a positive number when marking as Sold';
    END IF;
    PERFORM public.create_sale_atomic(
      p_sale_price, COALESCE(p_sale_date, CURRENT_DATE), p_client_id, p_instrument_id, p_sales_note
    );

  ELSIF v_current.status = 'Sold' AND v_next_status <> 'Sold' THEN
    SELECT sh.id INTO v_refund_source
    FROM public.sales_history AS sh
    WHERE sh.instrument_id = p_instrument_id
      AND sh.org_id = v_org_id
      AND sh.entry_kind = 'sale'
      AND NOT EXISTS (
        SELECT 1 FROM public.sales_history AS r
        WHERE r.adjustment_of_sale_id = sh.id
          AND r.org_id = v_org_id
          AND r.entry_kind = 'refund'
      )
    ORDER BY sh.sale_date DESC, sh.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_refund_source IS NULL THEN
      RAISE EXCEPTION 'No refundable sale entry found for instrument';
    END IF;

    PERFORM public.create_sale_adjustment_atomic(v_refund_source, 'refund', p_sales_note);
  END IF;

  UPDATE public.instruments SET
    status                 = CASE WHEN p_patch ? 'status'                 THEN NULLIF(p_patch->>'status','')                            ELSE status                 END,
    maker                  = CASE WHEN p_patch ? 'maker'                  THEN p_patch->>'maker'                                         ELSE maker                  END,
    type                   = CASE WHEN p_patch ? 'type'                   THEN p_patch->>'type'                                          ELSE type                   END,
    subtype                = CASE WHEN p_patch ? 'subtype'                THEN p_patch->>'subtype'                                       ELSE subtype                END,
    year                   = CASE WHEN p_patch ? 'year'                   THEN NULLIF(p_patch->>'year','')::integer                      ELSE year                   END,
    certificate            = CASE WHEN p_patch ? 'certificate'            THEN NULLIF(p_patch->>'certificate','')::boolean               ELSE certificate            END,
    cost_price             = CASE WHEN p_patch ? 'cost_price'             THEN NULLIF(p_patch->>'cost_price','')::numeric                ELSE cost_price             END,
    consignment_price      = CASE WHEN p_patch ? 'consignment_price'      THEN NULLIF(p_patch->>'consignment_price','')::numeric         ELSE consignment_price      END,
    size                   = CASE WHEN p_patch ? 'size'                   THEN p_patch->>'size'                                          ELSE size                   END,
    weight                 = CASE WHEN p_patch ? 'weight'                 THEN p_patch->>'weight'                                        ELSE weight                 END,
    price                  = CASE WHEN p_patch ? 'price'                  THEN NULLIF(p_patch->>'price','')::numeric                     ELSE price                  END,
    ownership              = CASE WHEN p_patch ? 'ownership'              THEN p_patch->>'ownership'                                      ELSE ownership              END,
    note                   = CASE WHEN p_patch ? 'note'                   THEN p_patch->>'note'                                          ELSE note                   END,
    serial_number          = CASE WHEN p_patch ? 'serial_number'          THEN p_patch->>'serial_number'                                 ELSE serial_number          END,
    reserved_reason        = CASE WHEN p_patch ? 'reserved_reason'        THEN p_patch->>'reserved_reason'                               ELSE reserved_reason        END,
    reserved_by_user_id    = CASE WHEN p_patch ? 'reserved_by_user_id'    THEN NULLIF(p_patch->>'reserved_by_user_id','')::uuid          ELSE reserved_by_user_id    END,
    reserved_connection_id = CASE WHEN p_patch ? 'reserved_connection_id' THEN NULLIF(p_patch->>'reserved_connection_id','')::uuid       ELSE reserved_connection_id END
  WHERE id = p_instrument_id AND org_id = v_org_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- Unconditional, explicit privilege convergence on the final
-- seven-argument signature -- see header comment for why this cannot
-- rely on CREATE OR REPLACE's ACL-preservation behavior alone.
REVOKE ALL ON FUNCTION public.update_instrument_sale_transition_atomic(
  UUID, JSONB, NUMERIC, DATE, UUID, TEXT, TIMESTAMPTZ
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_instrument_sale_transition_atomic(
  UUID, JSONB, NUMERIC, DATE, UUID, TEXT, TIMESTAMPTZ
) FROM anon;

GRANT EXECUTE ON FUNCTION public.update_instrument_sale_transition_atomic(
  UUID, JSONB, NUMERIC, DATE, UUID, TEXT, TIMESTAMPTZ
) TO authenticated;
