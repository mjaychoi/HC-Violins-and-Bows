-- ============================================================
-- Initial Schema — HC Violins and Bows
-- Safe to run on an empty Supabase database.
-- All tables created in dependency order with final column set
-- (no follow-on ALTER TABLE needed for columns added in old migrations).
-- ============================================================

-- ──────────────────────────────────────────────
-- 1. ORGANIZATIONS
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────
-- 2. INSTRUMENTS
-- Columns include every field added via ALTER in old migrations
-- (subtype, serial_number, reserved_*).
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.instruments (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type                  TEXT        NOT NULL,
  maker                 TEXT,
  subtype               TEXT,
  year                  INTEGER,
  certificate           BOOLEAN     NOT NULL DEFAULT false,
  cost_price            NUMERIC(12,2),
  consignment_price     NUMERIC(12,2),
  size                  TEXT,
  weight                TEXT,
  price                 NUMERIC(12,2),
  ownership             TEXT,
  note                  TEXT,
  serial_number         TEXT,
  status                TEXT        NOT NULL DEFAULT 'Available'
    CHECK (status IN ('Available','Booked','Sold','Reserved','Maintenance')),
  reserved_reason       TEXT,
  reserved_by_user_id   UUID,
  reserved_connection_id UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_instruments_serial_number
  ON public.instruments(serial_number)
  WHERE serial_number IS NOT NULL;

-- ──────────────────────────────────────────────
-- 3. CLIENTS
-- client_number added in old migration 20250101000001.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clients (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  email         TEXT,
  phone         TEXT,
  client_number TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_client_number
  ON public.clients(client_number)
  WHERE client_number IS NOT NULL;

-- ──────────────────────────────────────────────
-- 4. CLIENT_INSTRUMENTS  (junction / connections)
-- display_order included (was added via ALTER in old migration).
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_instruments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id         UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  instrument_id     UUID        NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  relationship_type TEXT        NOT NULL,
  notes             TEXT,
  display_order     INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce one "Owned" relationship per instrument across the whole org.
CREATE UNIQUE INDEX IF NOT EXISTS client_instruments_single_owner_per_instrument
  ON public.client_instruments(instrument_id)
  WHERE relationship_type = 'Owned';

-- ──────────────────────────────────────────────
-- 5. SALES_HISTORY
-- entry_kind and adjustment_of_sale_id included from the start.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_history (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instrument_id        UUID        REFERENCES public.instruments(id) ON DELETE SET NULL,
  client_id            UUID        REFERENCES public.clients(id) ON DELETE SET NULL,
  sale_price           NUMERIC(12,2) NOT NULL CONSTRAINT sales_history_non_zero_sale_price CHECK (sale_price <> 0),
  sale_date            DATE        NOT NULL,
  notes                TEXT,
  entry_kind           TEXT        NOT NULL DEFAULT 'sale'
    CHECK (entry_kind IN ('sale','refund','undo_refund','adjustment')),
  adjustment_of_sale_id UUID       REFERENCES public.sales_history(id) ON DELETE RESTRICT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_history_one_refund_per_sale_idx
  ON public.sales_history(adjustment_of_sale_id)
  WHERE entry_kind = 'refund';

CREATE UNIQUE INDEX IF NOT EXISTS sales_history_one_undo_refund_per_refund_idx
  ON public.sales_history(adjustment_of_sale_id)
  WHERE entry_kind = 'undo_refund';

-- ──────────────────────────────────────────────
-- 6. INVOICES
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id             UUID        REFERENCES public.clients(id) ON DELETE SET NULL,
  invoice_date          DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date              DATE,
  subtotal              NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax                   NUMERIC(12,2),
  total                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency              TEXT        NOT NULL DEFAULT 'USD',
  status                TEXT        NOT NULL DEFAULT 'draft',
  notes                 TEXT,
  business_name         TEXT,
  business_address      TEXT,
  business_phone        TEXT,
  business_email        TEXT,
  bank_account_holder   TEXT,
  bank_name             TEXT,
  bank_swift_code       TEXT,
  bank_account_number   TEXT,
  default_conditions    TEXT,
  default_exchange_rate TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────
-- 7. INVOICE_ITEMS
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id    UUID        NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  instrument_id UUID        REFERENCES public.instruments(id) ON DELETE SET NULL,
  description   TEXT,
  qty           INTEGER     NOT NULL DEFAULT 0,
  rate          NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  image_url     TEXT,
  display_order INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────
-- 8. INVOICE_SETTINGS  (one row per org)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_settings (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_settings_one_row_per_org
  ON public.invoice_settings(org_id);

-- ──────────────────────────────────────────────
-- 9. INSTRUMENT_IMAGES
-- storage_key included from the start (avoids the later ADD COLUMN migration).
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.instrument_images (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID        NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  image_url     TEXT        NOT NULL,
  storage_key   TEXT,
  file_name     TEXT,
  file_size     BIGINT,
  mime_type     TEXT,
  display_order INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.instrument_images.storage_key IS
  'Canonical physical storage object key returned by the storage layer.';

-- ──────────────────────────────────────────────
-- 10. INSTRUMENT_CERTIFICATES
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.instrument_certificates (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID        NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  storage_path  TEXT        NOT NULL,
  original_name TEXT,
  mime_type     TEXT,
  size          BIGINT,
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  is_primary    BOOLEAN     NOT NULL DEFAULT false,
  version       INTEGER     NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────
-- 11. MAINTENANCE_TASKS
-- client_id and org_id included from the start.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.maintenance_tasks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instrument_id     UUID        REFERENCES public.instruments(id) ON DELETE CASCADE,
  client_id         UUID        REFERENCES public.clients(id) ON DELETE SET NULL,
  task_type         TEXT        NOT NULL
    CHECK (task_type IN ('repair','rehair','maintenance','inspection','setup','adjustment','restoration')),
  title             TEXT        NOT NULL,
  description       TEXT,
  status            TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','cancelled')),
  received_date     DATE        NOT NULL,
  due_date          DATE,
  personal_due_date DATE,
  scheduled_date    DATE,
  completed_date    DATE,
  priority          TEXT        NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','urgent')),
  estimated_hours   NUMERIC(6,2),
  actual_hours      NUMERIC(6,2),
  cost              NUMERIC(12,2),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────
-- 12. CONTACT_LOGS
-- follow_up_completed_at and org_id included from the start.
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_logs (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id               UUID        REFERENCES public.clients(id) ON DELETE CASCADE,
  instrument_id           UUID        REFERENCES public.instruments(id) ON DELETE SET NULL,
  contact_type            TEXT        NOT NULL
    CHECK (contact_type IN ('email','phone','meeting','note','follow_up')),
  subject                 TEXT,
  content                 TEXT        NOT NULL,
  contact_date            DATE        NOT NULL,
  next_follow_up_date     DATE,
  purpose                 TEXT,
  follow_up_completed_at  TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────
-- 13. NOTIFICATION_SETTINGS
-- org_id included; composite PK (org_id, user_id).
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_settings (
  org_id                   UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id                  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_notifications      BOOLEAN     NOT NULL DEFAULT true,
  notification_time        TIME        NOT NULL DEFAULT '09:00',
  days_before_due          INTEGER[]   NOT NULL DEFAULT ARRAY[3,1],
  enabled                  BOOLEAN     NOT NULL DEFAULT true,
  last_notification_sent_at TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

-- ──────────────────────────────────────────────
-- 14. INVOICE_IDEMPOTENCY_KEYS
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_idempotency_keys (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL,
  route_key        TEXT        NOT NULL,
  idempotency_key  TEXT        NOT NULL,
  request_hash     TEXT        NOT NULL,
  invoice_id       UUID        REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, route_key, idempotency_key)
);

-- ──────────────────────────────────────────────
-- 15. SALES_IDEMPOTENCY_KEYS
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_idempotency_keys (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL,
  route_key        TEXT        NOT NULL,
  idempotency_key  TEXT        NOT NULL,
  request_hash     TEXT        NOT NULL,
  sale_id          UUID        REFERENCES public.sales_history(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, route_key, idempotency_key)
);

-- ──────────────────────────────────────────────
-- 16. INVOICE_IMAGE_UPLOADS
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_image_uploads (
  org_id              UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_path           TEXT        NOT NULL,
  uploaded_by_user_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_invoice_id   UUID        REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at          TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours'),
  PRIMARY KEY (org_id, file_path)
);
