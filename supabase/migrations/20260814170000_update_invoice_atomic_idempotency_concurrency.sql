-- V5-002 + V5-003: Invoice update idempotency + optimistic concurrency (CAS).
--
-- Before this migration, PUT /api/invoices/[id] required an Idempotency-Key
-- header (src/app/api/invoices/[id]/route.ts) but the client never sent one
-- (src/app/invoices/hooks/useInvoices.ts), so every supported Invoice edit
-- failed with 400 IDEMPOTENCY_KEY_REQUIRED (V5-002). The header requirement
-- was also only a presence guard: nothing on the server actually deduplicated
-- retries, and public.update_invoice_atomic(UUID, JSONB, JSONB) had no
-- concurrency token, so once the client started sending the header, two
-- concurrent full-form edits would silently last-write-wins overwrite each
-- other's changes (V5-003, latent until V5-002 shipped).
--
-- This migration closes both gaps atomically, mirroring the two concurrency
-- patterns that already exist elsewhere in this schema rather than inventing
-- a third:
--   * optimistic concurrency: the same p_expected_updated_at TIMESTAMPTZ
--     DEFAULT NULL parameter + FOR UPDATE + IS DISTINCT FROM check used by
--     public.update_instrument_sale_transition_atomic
--     (20260423140001_update_instrument_sale_transition_atomic_consolidated.sql);
--   * request-level idempotency: the same reserve/replay/release loop over a
--     dedicated *_idempotency_keys table used by
--     public.create_invoice_atomic_idempotent
--     (00000000000028_create_invoice_atomic_idempotent.sql), which already
--     stores rows in public.invoice_idempotency_keys keyed by
--     (org_id, user_id, route_key, idempotency_key). Routing PUT through its
--     own route_key ('PUT:/api/invoices/:id') means the create and update
--     paths share the same table without their keys ever colliding.
--
-- Combining both in one wrapper RPC (update_invoice_atomic_idempotent) rather
-- than doing the idempotency claim in the API route and the CAS check in the
-- RPC keeps "claim -> CAS -> mutate -> record result" inside a single
-- transaction. That ordering is what makes retry-after-lost-response safe:
-- replaying an already-completed key returns the stored result immediately,
-- without re-running the now-stale CAS comparison against the row the first
-- attempt already advanced.
--
-- update_invoice_atomic keeps its existing three-argument call sites working
-- during any partial deploy window (the fourth argument defaults to NULL,
-- which skips the CAS check exactly like the instrument RPC's default), but
-- the plain three-argument overload is DROPped below so no caller can reach
-- an update path with no concurrency protection at all -- see the "old
-- unsafe overload" section for why CREATE OR REPLACE alone cannot achieve
-- that.

-- ──────────────────────────────────────────────
-- update_invoice_atomic: add p_expected_updated_at CAS parameter
-- ──────────────────────────────────────────────

-- CREATE OR REPLACE FUNCTION cannot change an existing function's argument
-- list; it only replaces the body of a function with the exact same
-- signature it is given, or creates a new overload if the signature differs.
-- Adding a trailing parameter therefore requires dropping the old
-- three-argument signature explicitly -- otherwise it keeps existing
-- alongside the new four-argument one as a second, CAS-less overload that
-- remains fully callable (see "old unsafe overload" section below for why
-- that is unacceptable here).
DROP FUNCTION IF EXISTS public.update_invoice_atomic(UUID, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.update_invoice_atomic(
  p_invoice_id UUID,
  p_invoice    JSONB DEFAULT '{}'::jsonb,
  p_items      JSONB DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id UUID := public.org_id();
  v_current_updated_at TIMESTAMPTZ;
BEGIN
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization context missing'; END IF;

  SELECT updated_at INTO v_current_updated_at
  FROM public.invoices
  WHERE id = p_invoice_id AND org_id = v_org_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  -- CAS: only enforced when the caller supplies a token, exactly like
  -- update_instrument_sale_transition_atomic's p_expected_updated_at. The
  -- supported Invoice edit route (PUT /api/invoices/[id]) always supplies
  -- one; NULL stays available for any caller that legitimately has no prior
  -- read to compare against. Checked -- and this exception raised -- before
  -- any row is touched, so a stale request mutates nothing.
  IF p_expected_updated_at IS NOT NULL
     AND v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'INVOICE_CONCURRENCY_CONFLICT: Invoice was updated by someone else'
      USING ERRCODE = '23514',
            DETAIL  = '{"error_code":"INVOICE_CONCURRENCY_CONFLICT"}',
            HINT    = 'INVOICE_CONCURRENCY_CONFLICT';
  END IF;

  UPDATE public.invoices SET
    client_id             = CASE WHEN p_invoice ? 'client_id'             THEN NULLIF(p_invoice->>'client_id','')::uuid         ELSE client_id             END,
    invoice_date          = CASE WHEN p_invoice ? 'invoice_date'          THEN NULLIF(p_invoice->>'invoice_date','')::date       ELSE invoice_date          END,
    due_date              = CASE WHEN p_invoice ? 'due_date'              THEN NULLIF(p_invoice->>'due_date','')::date           ELSE due_date              END,
    subtotal              = CASE WHEN p_invoice ? 'subtotal'              THEN NULLIF(p_invoice->>'subtotal','')::numeric        ELSE subtotal              END,
    tax                   = CASE WHEN p_invoice ? 'tax'                   THEN NULLIF(p_invoice->>'tax','')::numeric             ELSE tax                   END,
    total                 = CASE WHEN p_invoice ? 'total'                 THEN NULLIF(p_invoice->>'total','')::numeric           ELSE total                 END,
    currency              = CASE WHEN p_invoice ? 'currency'              THEN NULLIF(p_invoice->>'currency','')                 ELSE currency              END,
    status                = CASE WHEN p_invoice ? 'status'                THEN NULLIF(p_invoice->>'status','')                   ELSE status                END,
    notes                 = CASE WHEN p_invoice ? 'notes'                 THEN p_invoice->>'notes'                               ELSE notes                 END,
    business_name         = CASE WHEN p_invoice ? 'business_name'         THEN p_invoice->>'business_name'                       ELSE business_name         END,
    business_address      = CASE WHEN p_invoice ? 'business_address'      THEN p_invoice->>'business_address'                    ELSE business_address      END,
    business_phone        = CASE WHEN p_invoice ? 'business_phone'        THEN p_invoice->>'business_phone'                      ELSE business_phone        END,
    business_email        = CASE WHEN p_invoice ? 'business_email'        THEN p_invoice->>'business_email'                      ELSE business_email        END,
    bank_account_holder   = CASE WHEN p_invoice ? 'bank_account_holder'   THEN p_invoice->>'bank_account_holder'                 ELSE bank_account_holder   END,
    bank_name             = CASE WHEN p_invoice ? 'bank_name'             THEN p_invoice->>'bank_name'                           ELSE bank_name             END,
    bank_swift_code       = CASE WHEN p_invoice ? 'bank_swift_code'       THEN p_invoice->>'bank_swift_code'                     ELSE bank_swift_code       END,
    bank_account_number   = CASE WHEN p_invoice ? 'bank_account_number'   THEN p_invoice->>'bank_account_number'                 ELSE bank_account_number   END,
    default_conditions    = CASE WHEN p_invoice ? 'default_conditions'    THEN p_invoice->>'default_conditions'                  ELSE default_conditions    END,
    default_exchange_rate = CASE WHEN p_invoice ? 'default_exchange_rate' THEN p_invoice->>'default_exchange_rate'               ELSE default_exchange_rate END
  WHERE id = p_invoice_id AND org_id = v_org_id;

  IF p_items IS NOT NULL THEN
    IF jsonb_typeof(p_items) <> 'array' THEN
      RAISE EXCEPTION 'Invoice items payload must be an array';
    END IF;

    DELETE FROM public.invoice_items
    WHERE invoice_id = p_invoice_id AND org_id = v_org_id;

    IF jsonb_array_length(p_items) > 0 THEN
      INSERT INTO public.invoice_items (
        org_id, invoice_id, instrument_id, description, qty, rate, amount, image_url, display_order
      )
      SELECT
        v_org_id, p_invoice_id,
        NULLIF(item->>'instrument_id','')::uuid,
        item->>'description',
        COALESCE(NULLIF(item->>'qty','')::integer, 0),
        COALESCE(NULLIF(item->>'rate','')::numeric, 0),
        COALESCE(NULLIF(item->>'amount','')::numeric, 0),
        item->>'image_url',
        COALESCE(NULLIF(item->>'display_order','')::integer, 0)
      FROM jsonb_array_elements(p_items) AS item;
    END IF;
  END IF;

  -- F2 (20260801200000_enforce_invoice_financial_invariants.sql): same
  -- assertion as before this migration. Aborts the transaction, so a
  -- rejected update leaves the previous invoice and line-item rows
  -- untouched.
  PERFORM public.assert_invoice_financial_invariants(p_invoice_id);

  RETURN p_invoice_id;
END;
$$;

-- Unconditional, explicit privilege convergence on the final four-argument
-- signature -- CREATE OR REPLACE preserves whatever ACLs the signature
-- already had, which is fine for a body-only change but is not being relied
-- on here since the signature itself changed (see
-- 20260423140001_update_instrument_sale_transition_atomic_consolidated.sql
-- for the same reasoning applied to the sale-transition RPC).
REVOKE ALL ON FUNCTION public.update_invoice_atomic(UUID, JSONB, JSONB, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_invoice_atomic(UUID, JSONB, JSONB, TIMESTAMPTZ) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_invoice_atomic(UUID, JSONB, JSONB, TIMESTAMPTZ) TO authenticated;

-- ──────────────────────────────────────────────
-- update_invoice_atomic_idempotent: request-level dedup wrapper
--
-- Same reserve/replay/release loop as create_invoice_atomic_idempotent
-- (00000000000028_create_invoice_atomic_idempotent.sql) over
-- public.invoice_idempotency_keys, parameterised by route_key so the PUT
-- path's keys never collide with the POST path's. On a request hash match
-- against an already-completed key it returns the stored invoice_id directly
-- -- it does not re-invoke update_invoice_atomic, so a lost-response retry
-- cannot be rejected by a CAS check that only makes sense against the
-- pre-update row.
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_invoice_atomic_idempotent(
  p_route_key           TEXT,
  p_idempotency_key     TEXT,
  p_request_hash        TEXT,
  p_invoice_id          UUID,
  p_invoice             JSONB DEFAULT '{}'::jsonb,
  p_items               JSONB DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id                UUID := public.org_id();
  v_user_id               UUID := auth.uid();
  v_result_invoice_id     UUID;
  v_existing_request_hash TEXT;
  v_existing_invoice_id   UUID;
  v_reserved              BOOLEAN := FALSE;
BEGIN
  IF v_org_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication context missing';
  END IF;

  IF p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 THEN
    RETURN public.update_invoice_atomic(
      p_invoice_id, p_invoice, p_items, p_expected_updated_at
    );
  END IF;

  LOOP
    INSERT INTO public.invoice_idempotency_keys (
      org_id, user_id, route_key, idempotency_key, request_hash
    )
    VALUES (v_org_id, v_user_id, p_route_key, p_idempotency_key, p_request_hash)
    ON CONFLICT (org_id, user_id, route_key, idempotency_key) DO NOTHING;

    IF FOUND THEN v_reserved := TRUE; EXIT; END IF;

    SELECT request_hash, invoice_id
      INTO v_existing_request_hash, v_existing_invoice_id
    FROM public.invoice_idempotency_keys
    WHERE org_id = v_org_id AND user_id = v_user_id
      AND route_key = p_route_key AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF NOT FOUND THEN CONTINUE; END IF;

    IF v_existing_request_hash <> p_request_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED: Idempotency key reuse with different payload'
        USING ERRCODE = '23514',
              DETAIL  = '{"error_code":"IDEMPOTENCY_KEY_REUSED"}',
              HINT    = 'IDEMPOTENCY_KEY_REUSED';
    END IF;

    IF v_existing_invoice_id IS NOT NULL THEN
      RETURN v_existing_invoice_id;
    END IF;

    RAISE EXCEPTION 'IDEMPOTENCY_IN_PROGRESS: Idempotent request is already in progress'
      USING ERRCODE = '23514',
            DETAIL  = '{"error_code":"IDEMPOTENCY_IN_PROGRESS"}',
            HINT    = 'IDEMPOTENCY_IN_PROGRESS';
  END LOOP;

  v_result_invoice_id := public.update_invoice_atomic(
    p_invoice_id, p_invoice, p_items, p_expected_updated_at
  );

  UPDATE public.invoice_idempotency_keys
  SET invoice_id = v_result_invoice_id
  WHERE org_id = v_org_id AND user_id = v_user_id
    AND route_key = p_route_key AND idempotency_key = p_idempotency_key;

  RETURN v_result_invoice_id;
EXCEPTION WHEN OTHERS THEN
  -- A failed attempt (CAS conflict, invoice not found, financial invariant
  -- violation, or the reuse/in-progress guards above) must not permanently
  -- poison the key: release the reservation this call made -- and only this
  -- call's reservation, never a concurrent caller's -- so a legitimate later
  -- retry under the same key can claim it again. v_reserved is only TRUE
  -- when this invocation won the INSERT race above; the "invoice_id IS NULL"
  -- guard additionally protects against deleting a row a *different*,
  -- already-completed call already stamped with a result between this call's
  -- INSERT and this EXCEPTION handler running (not reachable today since
  -- invoice_id is only ever set immediately before RETURN in the same
  -- statement that reserved it, but kept for the same reason
  -- create_invoice_atomic_idempotent keeps it).
  IF v_reserved THEN
    DELETE FROM public.invoice_idempotency_keys
    WHERE org_id = v_org_id AND user_id = v_user_id
      AND route_key = p_route_key AND idempotency_key = p_idempotency_key
      AND invoice_id IS NULL;
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.update_invoice_atomic_idempotent(TEXT, TEXT, TEXT, UUID, JSONB, JSONB, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_invoice_atomic_idempotent(TEXT, TEXT, TEXT, UUID, JSONB, JSONB, TIMESTAMPTZ) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_invoice_atomic_idempotent(TEXT, TEXT, TEXT, UUID, JSONB, JSONB, TIMESTAMPTZ) TO authenticated;

-- ──────────────────────────────────────────────
-- Old unsafe overload
--
-- The three-argument public.update_invoice_atomic(UUID, JSONB, JSONB) was
-- DROPped above before the four-argument replacement was created, so no
-- CAS-less overload survives this migration. This is a correctness
-- requirement, not cleanup: PostgreSQL resolves overloaded functions by
-- argument count, so a naive CREATE OR REPLACE of only the new signature
-- would have left the old three-argument, no-concurrency-check function
-- fully callable by any authenticated caller that still invokes it with
-- three arguments (or that PostgREST resolves to it via an older cached
-- schema), reopening V5-003 for that caller even though the API route now
-- always requests the four-argument form.
-- ──────────────────────────────────────────────
