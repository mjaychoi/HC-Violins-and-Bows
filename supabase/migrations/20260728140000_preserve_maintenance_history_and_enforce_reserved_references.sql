-- Preserve maintenance history (RESTRICT) and enforce instrument reserved-field references.
-- Batch B: maintenance_tasks.instrument_id NOT NULL + ON DELETE RESTRICT;
-- instruments.reserved_by_user_id -> auth.users(id) ON DELETE SET NULL;
-- instruments.reserved_connection_id -> client_instruments(id) ON DELETE SET NULL
-- plus same-org/same-instrument trigger invariants.

-- ──────────────────────────────────────────────
-- Preflight: aggregate-only checks (fail closed, no auto-remediation)
-- ──────────────────────────────────────────────
DO $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.maintenance_tasks mt
  LEFT JOIN public.instruments i ON i.id = mt.instrument_id
  WHERE mt.instrument_id IS NULL
     OR i.id IS NULL;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Preflight failed: maintenance_tasks_missing_instrument mismatch_count=%',
      v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.instruments i
  LEFT JOIN auth.users u ON u.id = i.reserved_by_user_id
  WHERE i.reserved_by_user_id IS NOT NULL
    AND u.id IS NULL;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Preflight failed: reserved_by_user_missing_user mismatch_count=%',
      v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.instruments i
  LEFT JOIN public.client_instruments ci
    ON ci.id = i.reserved_connection_id
  WHERE i.reserved_connection_id IS NOT NULL
    AND ci.id IS NULL;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Preflight failed: reserved_connection_missing mismatch_count=%',
      v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.instruments i
  JOIN public.client_instruments ci
    ON ci.id = i.reserved_connection_id
  WHERE i.reserved_connection_id IS NOT NULL
    AND i.org_id IS DISTINCT FROM ci.org_id;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Preflight failed: reserved_connection_org_mismatch mismatch_count=%',
      v_count;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.instruments i
  JOIN public.client_instruments ci
    ON ci.id = i.reserved_connection_id
  WHERE i.reserved_connection_id IS NOT NULL
    AND i.id IS DISTINCT FROM ci.instrument_id;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Preflight failed: reserved_connection_instrument_mismatch mismatch_count=%',
      v_count;
  END IF;
END
$$;

-- ──────────────────────────────────────────────
-- maintenance_tasks.instrument_id: NOT NULL + RESTRICT FK
-- ──────────────────────────────────────────────
DO $$
DECLARE
  v_fk_count INTEGER;
  v_fk_name  TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.maintenance_tasks
    WHERE instrument_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot set maintenance_tasks.instrument_id NOT NULL: null values exist';
  END IF;

  SELECT COUNT(*)
    INTO v_fk_count
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid
   AND a.attnum = ANY (c.conkey)
   AND NOT a.attisdropped
  WHERE c.conrelid = 'public.maintenance_tasks'::regclass
    AND c.contype = 'f'
    AND a.attname = 'instrument_id';

  IF v_fk_count > 1 THEN
    RAISE EXCEPTION
      'Unexpected duplicate maintenance_tasks.instrument_id foreign keys (count=%)',
      v_fk_count;
  END IF;

  IF v_fk_count = 1 THEN
    SELECT c.conname
      INTO v_fk_name
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
     AND NOT a.attisdropped
    WHERE c.conrelid = 'public.maintenance_tasks'::regclass
      AND c.contype = 'f'
      AND a.attname = 'instrument_id';

    IF EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute src
        ON src.attrelid = c.conrelid
       AND src.attnum = c.conkey[1]
       AND NOT src.attisdropped
      JOIN pg_attribute ref
        ON ref.attrelid = c.confrelid
       AND ref.attnum = c.confkey[1]
       AND NOT ref.attisdropped
      WHERE c.contype = 'f'
        AND c.conrelid = 'public.maintenance_tasks'::regclass
        AND c.conname = 'maintenance_tasks_instrument_id_fkey'
        AND c.confrelid = 'public.instruments'::regclass
        AND src.attname = 'instrument_id'
        AND ref.attname = 'id'
        AND c.confdeltype = 'r'
    ) THEN
      NULL; -- desired state already present
    ELSE
      EXECUTE format(
        'ALTER TABLE public.maintenance_tasks DROP CONSTRAINT %I',
        v_fk_name
      );
      v_fk_count := 0;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'maintenance_tasks'
      AND column_name = 'instrument_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.maintenance_tasks
      ALTER COLUMN instrument_id SET NOT NULL;
  END IF;

  IF v_fk_count = 0
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.maintenance_tasks'::regclass
         AND conname = 'maintenance_tasks_instrument_id_fkey'
     ) THEN
    ALTER TABLE public.maintenance_tasks
      ADD CONSTRAINT maintenance_tasks_instrument_id_fkey
      FOREIGN KEY (instrument_id)
      REFERENCES public.instruments(id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

-- ──────────────────────────────────────────────
-- instruments.reserved_by_user_id -> auth.users(id)
-- ──────────────────────────────────────────────
DO $$
DECLARE
  v_fk_count INTEGER;
  v_fk_name  TEXT;
BEGIN
  SELECT COUNT(*)
    INTO v_fk_count
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid
   AND a.attnum = ANY (c.conkey)
   AND NOT a.attisdropped
  WHERE c.conrelid = 'public.instruments'::regclass
    AND c.contype = 'f'
    AND a.attname = 'reserved_by_user_id';

  IF v_fk_count > 1 THEN
    RAISE EXCEPTION
      'Unexpected duplicate instruments.reserved_by_user_id foreign keys (count=%)',
      v_fk_count;
  END IF;

  IF v_fk_count = 1 THEN
    SELECT c.conname
      INTO v_fk_name
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
     AND NOT a.attisdropped
    WHERE c.conrelid = 'public.instruments'::regclass
      AND c.contype = 'f'
      AND a.attname = 'reserved_by_user_id';

    IF EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute src
        ON src.attrelid = c.conrelid
       AND src.attnum = c.conkey[1]
       AND NOT src.attisdropped
      JOIN pg_attribute ref
        ON ref.attrelid = c.confrelid
       AND ref.attnum = c.confkey[1]
       AND NOT ref.attisdropped
      WHERE c.contype = 'f'
        AND c.conrelid = 'public.instruments'::regclass
        AND c.conname = 'instruments_reserved_by_user_id_fkey'
        AND c.confrelid = 'auth.users'::regclass
        AND src.attname = 'reserved_by_user_id'
        AND ref.attname = 'id'
        AND c.confdeltype = 'n'
    ) THEN
      NULL; -- desired state already present
    ELSE
      EXECUTE format(
        'ALTER TABLE public.instruments DROP CONSTRAINT %I',
        v_fk_name
      );
      v_fk_count := 0;
    END IF;
  END IF;

  IF v_fk_count = 0
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.instruments'::regclass
         AND conname = 'instruments_reserved_by_user_id_fkey'
     ) THEN
    ALTER TABLE public.instruments
      ADD CONSTRAINT instruments_reserved_by_user_id_fkey
      FOREIGN KEY (reserved_by_user_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- ──────────────────────────────────────────────
-- instruments.reserved_connection_id -> client_instruments(id)
-- ──────────────────────────────────────────────
DO $$
DECLARE
  v_fk_count INTEGER;
  v_fk_name  TEXT;
BEGIN
  SELECT COUNT(*)
    INTO v_fk_count
  FROM pg_constraint c
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid
   AND a.attnum = ANY (c.conkey)
   AND NOT a.attisdropped
  WHERE c.conrelid = 'public.instruments'::regclass
    AND c.contype = 'f'
    AND a.attname = 'reserved_connection_id';

  IF v_fk_count > 1 THEN
    RAISE EXCEPTION
      'Unexpected duplicate instruments.reserved_connection_id foreign keys (count=%)',
      v_fk_count;
  END IF;

  IF v_fk_count = 1 THEN
    SELECT c.conname
      INTO v_fk_name
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
     AND NOT a.attisdropped
    WHERE c.conrelid = 'public.instruments'::regclass
      AND c.contype = 'f'
      AND a.attname = 'reserved_connection_id';

    IF EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute src
        ON src.attrelid = c.conrelid
       AND src.attnum = c.conkey[1]
       AND NOT src.attisdropped
      JOIN pg_attribute ref
        ON ref.attrelid = c.confrelid
       AND ref.attnum = c.confkey[1]
       AND NOT ref.attisdropped
      WHERE c.contype = 'f'
        AND c.conrelid = 'public.instruments'::regclass
        AND c.conname = 'instruments_reserved_connection_id_fkey'
        AND c.confrelid = 'public.client_instruments'::regclass
        AND src.attname = 'reserved_connection_id'
        AND ref.attname = 'id'
        AND c.confdeltype = 'n'
    ) THEN
      NULL; -- desired state already present
    ELSE
      EXECUTE format(
        'ALTER TABLE public.instruments DROP CONSTRAINT %I',
        v_fk_name
      );
      v_fk_count := 0;
    END IF;
  END IF;

  IF v_fk_count = 0
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.instruments'::regclass
         AND conname = 'instruments_reserved_connection_id_fkey'
     ) THEN
    ALTER TABLE public.instruments
      ADD CONSTRAINT instruments_reserved_connection_id_fkey
      FOREIGN KEY (reserved_connection_id)
      REFERENCES public.client_instruments(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- ──────────────────────────────────────────────
-- Same-org / same-instrument invariant for reserved_connection_id
-- ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_instrument_reserved_reference_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_connection_org        UUID;
  v_connection_instrument UUID;
BEGIN
  IF NEW.reserved_connection_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialize pointer assignment vs connection retarget on the same row.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.reserved_connection_id::text, 301)
  );

  SELECT ci.org_id, ci.instrument_id
    INTO v_connection_org, v_connection_instrument
  FROM public.client_instruments ci
  WHERE ci.id = NEW.reserved_connection_id
  FOR UPDATE;

  IF v_connection_org IS NULL THEN
    RAISE EXCEPTION 'Referenced client_instruments connection not found';
  END IF;

  IF NEW.org_id IS DISTINCT FROM v_connection_org THEN
    RAISE EXCEPTION
      'reserved_connection_id must reference a connection in the same organization';
  END IF;

  IF NEW.id IS DISTINCT FROM v_connection_instrument THEN
    RAISE EXCEPTION
      'reserved_connection_id must reference a connection for the same instrument';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS instruments_reserved_reference_consistency_trigger
  ON public.instruments;

CREATE TRIGGER instruments_reserved_reference_consistency_trigger
  BEFORE INSERT OR UPDATE OF reserved_connection_id, org_id, id
  ON public.instruments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_instrument_reserved_reference_consistency();

CREATE OR REPLACE FUNCTION public.guard_referenced_client_instrument_retarget()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.org_id IS NOT DISTINCT FROM OLD.org_id
     AND NEW.instrument_id IS NOT DISTINCT FROM OLD.instrument_id THEN
    RETURN NEW;
  END IF;

  -- Same lock key/order as enforce_instrument_reserved_reference_consistency.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(OLD.id::text, 301)
  );

  PERFORM 1
  FROM public.instruments i
  WHERE i.reserved_connection_id = OLD.id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.instruments i
    WHERE i.reserved_connection_id = OLD.id
  ) THEN
    RAISE EXCEPTION
      'Cannot retarget client_instruments row referenced by instruments.reserved_connection_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_instruments_reserved_reference_guard_trigger
  ON public.client_instruments;

CREATE TRIGGER client_instruments_reserved_reference_guard_trigger
  BEFORE UPDATE OF org_id, instrument_id
  ON public.client_instruments
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_referenced_client_instrument_retarget();
