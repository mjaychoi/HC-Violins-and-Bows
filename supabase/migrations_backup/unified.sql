-- ============================================
-- HC-V Single Combined Migration (Idempotent)
-- Safe to re-run
-- ============================================

-- 0) Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Common updated_at trigger function (define ONCE)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ======================================================
-- 2) instruments: subtype + status constraint + trigger
-- ======================================================

-- 2.1 subtype
ALTER TABLE public.instruments
  ADD COLUMN IF NOT EXISTS subtype TEXT;

COMMENT ON COLUMN public.instruments.subtype
  IS '악기 서브타입 (예: 4/4, 3/4, 1/2 등)';

CREATE INDEX IF NOT EXISTS idx_instruments_subtype
  ON public.instruments(subtype)
  WHERE subtype IS NOT NULL;

-- 2.2 status constraint update (drop+add is OK and idempotent with IF EXISTS)
ALTER TABLE public.instruments
  DROP CONSTRAINT IF EXISTS instruments_status_check;

ALTER TABLE public.instruments
  ADD CONSTRAINT instruments_status_check
  CHECK (status::text = ANY (ARRAY[
    'Available'::text,
    'Booked'::text,
    'Sold'::text,
    'Reserved'::text,
    'Maintenance'::text
  ]));

COMMENT ON CONSTRAINT instruments_status_check ON public.instruments
  IS 'Status values: Available, Booked, Sold, Reserved, Maintenance';

-- 2.3 instruments updated_at trigger (drop+create to ensure correct wiring)
DROP TRIGGER IF EXISTS update_instruments_updated_at ON public.instruments;

CREATE TRIGGER update_instruments_updated_at
  BEFORE UPDATE ON public.instruments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TRIGGER update_instruments_updated_at ON public.instruments
  IS 'Automatically updates updated_at column when row is updated';

-- 2.4 Add numbers + prices + certificate_name
ALTER TABLE public.instruments
  ADD COLUMN IF NOT EXISTS serial_number TEXT,
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS consignment_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS certificate_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_instruments_serial_number
  ON public.instruments(serial_number)
  WHERE serial_number IS NOT NULL;

COMMENT ON COLUMN public.instruments.serial_number IS '악기 고유 번호 (예: VI123, BO456, mj123)';
COMMENT ON COLUMN public.instruments.cost_price IS 'Cost price of the instrument (shown only in detail view)';
COMMENT ON COLUMN public.instruments.consignment_price IS 'Consignment price of the instrument (shown only in detail view)';
COMMENT ON COLUMN public.instruments.certificate_name IS 'Name/type of certificate when certificate is true';

-- Trigram helpers (idempotent)
CREATE INDEX IF NOT EXISTS idx_instruments_maker_trgm
  ON public.instruments USING gin (maker gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_instruments_type_trgm
  ON public.instruments USING gin (type gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_instruments_subtype_trgm
  ON public.instruments USING gin (subtype gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_instruments_serial_number_trgm
  ON public.instruments USING gin (serial_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_instruments_ownership
  ON public.instruments(ownership) WHERE ownership IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_instruments_created_at
  ON public.instruments(created_at);

-- ======================================================
-- 3) clients: client_number + trigram helpers
-- ======================================================
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS client_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_client_number
  ON public.clients(client_number)
  WHERE client_number IS NOT NULL;

COMMENT ON COLUMN public.clients.client_number
  IS '클라이언트 고유 번호 (예: CL001, mj123)';

CREATE INDEX IF NOT EXISTS idx_clients_first_name_trgm
  ON public.clients USING gin (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_last_name_trgm
  ON public.clients USING gin (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_email_trgm
  ON public.clients USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_clients_created_at
  ON public.clients(created_at);

-- ======================================================
-- 4) maintenance_tasks (single definition) + client_id
-- ======================================================
CREATE TABLE IF NOT EXISTS public.maintenance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID REFERENCES public.instruments(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,

  task_type TEXT NOT NULL CHECK (task_type IN (
    'repair', 'rehair', 'maintenance', 'inspection', 'setup', 'adjustment', 'restoration'
  )),
  title TEXT NOT NULL,
  description TEXT,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'completed', 'cancelled'
  )),

  received_date DATE NOT NULL,
  due_date DATE,
  personal_due_date DATE,
  scheduled_date DATE,
  completed_date DATE,

  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  estimated_hours NUMERIC(6,2),
  actual_hours NUMERIC(6,2),
  cost NUMERIC(12,2),

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.maintenance_tasks IS '악기 및 활의 수리, 정비, 관리 작업을 추적하는 테이블';
COMMENT ON COLUMN public.maintenance_tasks.received_date IS '작업 접수일';
COMMENT ON COLUMN public.maintenance_tasks.due_date IS '고객이 요청한 납기일';
COMMENT ON COLUMN public.maintenance_tasks.personal_due_date IS '개인적으로 목표로 하는 완료일';
COMMENT ON COLUMN public.maintenance_tasks.scheduled_date IS '실제 작업을 예약한 날짜';
COMMENT ON COLUMN public.maintenance_tasks.completed_date IS '작업이 실제로 완료된 날짜';
COMMENT ON COLUMN public.maintenance_tasks.client_id IS '작업을 의뢰한 클라이언트 ID (선택사항)';

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_instrument_id ON public.maintenance_tasks(instrument_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_client_id ON public.maintenance_tasks(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_status ON public.maintenance_tasks(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_due_date ON public.maintenance_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_scheduled_date ON public.maintenance_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_personal_due_date ON public.maintenance_tasks(personal_due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_received_date ON public.maintenance_tasks(received_date);

-- updated_at trigger (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'update_maintenance_tasks_updated_at'
      AND n.nspname = 'public'
      AND c.relname = 'maintenance_tasks'
  ) THEN
    CREATE TRIGGER update_maintenance_tasks_updated_at
      BEFORE UPDATE ON public.maintenance_tasks
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.maintenance_tasks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'maintenance_tasks'
      AND policyname = 'Allow all operations for authenticated users'
  ) THEN
    CREATE POLICY "Allow all operations for authenticated users"
      ON public.maintenance_tasks
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ======================================================
-- 5) contact_logs (create + trigger + RLS)  (no risky FK rewrite)
-- ======================================================
CREATE TABLE IF NOT EXISTS public.contact_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  instrument_id UUID REFERENCES public.instruments(id) ON DELETE SET NULL,

  contact_type TEXT NOT NULL CHECK (contact_type IN (
    'email', 'phone', 'meeting', 'note', 'follow_up'
  )),
  subject TEXT,
  content TEXT NOT NULL,
  contact_date DATE NOT NULL,
  next_follow_up_date DATE,
  purpose TEXT,

  follow_up_completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.contact_logs IS '고객과의 연락 기록 및 Follow-up 일정을 추적하는 테이블';
COMMENT ON COLUMN public.contact_logs.contact_type IS '연락 유형 (email, phone, meeting, note, follow_up)';
COMMENT ON COLUMN public.contact_logs.contact_date IS '연락한 날짜';
COMMENT ON COLUMN public.contact_logs.next_follow_up_date IS '다음 연락 예정일 (Follow-up)';
COMMENT ON COLUMN public.contact_logs.purpose IS '연락 목적 (quote, follow_up, maintenance, sale 등)';
COMMENT ON COLUMN public.contact_logs.follow_up_completed_at IS 'Follow-up 완료 처리 시각 (null이면 미완료)';

CREATE INDEX IF NOT EXISTS idx_contact_logs_client_id ON public.contact_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_contact_logs_instrument_id ON public.contact_logs(instrument_id);
CREATE INDEX IF NOT EXISTS idx_contact_logs_contact_date ON public.contact_logs(contact_date);
CREATE INDEX IF NOT EXISTS idx_contact_logs_next_follow_up_date ON public.contact_logs(next_follow_up_date);
CREATE INDEX IF NOT EXISTS idx_contact_logs_contact_type ON public.contact_logs(contact_type);

CREATE INDEX IF NOT EXISTS idx_contact_logs_follow_up_completed_at
  ON public.contact_logs(follow_up_completed_at)
  WHERE follow_up_completed_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_contact_logs_updated_at'
      AND tgrelid = 'public.contact_logs'::regclass
  ) THEN
    CREATE TRIGGER update_contact_logs_updated_at
      BEFORE UPDATE ON public.contact_logs
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.contact_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contact_logs'
      AND policyname = 'Allow all operations for authenticated users'
  ) THEN
    CREATE POLICY "Allow all operations for authenticated users"
      ON public.contact_logs
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ======================================================
-- 6) client_instruments: display_order
-- ======================================================
ALTER TABLE public.client_instruments
  ADD COLUMN IF NOT EXISTS display_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_client_instruments_display_order
  ON public.client_instruments(display_order);

-- Backfill (only if NULL)
UPDATE public.client_instruments ci
SET display_order = s.row_number
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY relationship_type ORDER BY created_at ASC) AS row_number
  FROM public.client_instruments
) s
WHERE ci.id = s.id
  AND ci.display_order IS NULL;

-- If you already have NULLs in prod, these two are safe after backfill
ALTER TABLE public.client_instruments
  ALTER COLUMN display_order SET DEFAULT 0;

-- only set NOT NULL if you are sure backfill succeeded
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='client_instruments'
      AND column_name='display_order'
  ) THEN
    -- set NOT NULL only when there are no NULLs left
    IF NOT EXISTS (
      SELECT 1 FROM public.client_instruments WHERE display_order IS NULL
    ) THEN
      ALTER TABLE public.client_instruments
        ALTER COLUMN display_order SET NOT NULL;
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN public.client_instruments.display_order
  IS 'Display order for drag & drop sorting. Lower values appear first.';

-- ======================================================
-- 7) notification_settings
-- ======================================================
CREATE TABLE IF NOT EXISTS public.notification_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN DEFAULT true,
  notification_time TIME DEFAULT '09:00',
  days_before_due INTEGER[] DEFAULT ARRAY[3, 1],
  enabled BOOLEAN DEFAULT true,
  last_notification_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_settings_enabled
  ON public.notification_settings(enabled)
  WHERE enabled = true;

-- trigger (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_notification_settings_updated_at'
      AND tgrelid = 'public.notification_settings'::regclass
  ) THEN
    CREATE TRIGGER update_notification_settings_updated_at
      BEFORE UPDATE ON public.notification_settings
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notification_settings'
      AND policyname='Users can view their own notification settings'
  ) THEN
    CREATE POLICY "Users can view their own notification settings"
      ON public.notification_settings
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notification_settings'
      AND policyname='Users can insert their own notification settings'
  ) THEN
    CREATE POLICY "Users can insert their own notification settings"
      ON public.notification_settings
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notification_settings'
      AND policyname='Users can update their own notification settings'
  ) THEN
    CREATE POLICY "Users can update their own notification settings"
      ON public.notification_settings
      FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END $$;

COMMENT ON TABLE public.notification_settings IS '사용자별 이메일 알림 설정';

-- ======================================================
-- 8) invoices / invoice_items + invoice_number generator + org_id backup trigger
-- ======================================================

-- 8.1 invoice_number generator
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
BEGIN
  LOOP
    candidate := 'INV_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE invoice_number = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$$;

-- 8.2 invoices table (invoice_number default uses generator; unique via constraint)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  invoice_number TEXT NOT NULL DEFAULT public.generate_invoice_number(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  notes TEXT,

  -- per-invoice override fields
  business_name TEXT,
  business_address TEXT,
  business_phone TEXT,
  business_email TEXT,
  bank_account_holder TEXT,
  bank_name TEXT,
  bank_swift_code TEXT,
  bank_account_number TEXT,
  default_conditions TEXT,
  default_exchange_rate TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure columns exist if invoices table already existed (idempotent upgrades)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE public.invoices ALTER COLUMN invoice_number SET DEFAULT public.generate_invoice_number();
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS business_address TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS business_phone TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS business_email TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS bank_account_holder TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS bank_swift_code TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS default_conditions TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS default_exchange_rate TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_org_id ON public.invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON public.invoices(invoice_date);

-- Unique constraint for invoice_number (guarded)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_invoice_number_unique'
      AND conrelid = 'public.invoices'::regclass
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_invoice_number_unique UNIQUE (invoice_number);
  END IF;
END $$;

-- Backfill invoice_number if NULL/empty
UPDATE public.invoices
SET invoice_number = public.generate_invoice_number()
WHERE invoice_number IS NULL
   OR length(trim(invoice_number)) = 0;

-- 8.3 invoice_items
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  instrument_id UUID REFERENCES public.instruments(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  rate NUMERIC(12,2) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  image_url TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_instrument_id ON public.invoice_items(instrument_id);

COMMENT ON TABLE public.invoices IS '인보이스 테이블 - 고객에게 발행하는 영수증';
COMMENT ON TABLE public.invoice_items IS '인보이스 항목 테이블 - 한 인보이스에 여러 항목 포함 가능';

-- 8.4 RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='invoices'
      AND policyname='Allow all operations for authenticated users'
  ) THEN
    CREATE POLICY "Allow all operations for authenticated users"
      ON public.invoices
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='invoice_items'
      AND policyname='Allow all operations for authenticated users'
  ) THEN
    CREATE POLICY "Allow all operations for authenticated users"
      ON public.invoice_items
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 8.5 updated_at trigger for invoices (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_invoices_updated_at'
      AND tgrelid = 'public.invoices'::regclass
  ) THEN
    CREATE TRIGGER update_invoices_updated_at
      BEFORE UPDATE ON public.invoices
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 8.6 Backup org_id setter (only if NEW.org_id is null)
CREATE OR REPLACE FUNCTION public.set_invoice_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  jwt_org_id TEXT;
  jwt_claims JSONB;
BEGIN
  IF NEW.org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    jwt_claims := current_setting('request.jwt.claims', true)::jsonb;

    jwt_org_id :=
      COALESCE(
        jwt_claims->>'org_id',
        jwt_claims->>'organization_id',
        jwt_claims->>'orgId',
        jwt_claims->>'organizationId',
        jwt_claims->'user_metadata'->>'org_id',
        jwt_claims->'user_metadata'->>'organization_id',
        jwt_claims->'app_metadata'->>'org_id',
        jwt_claims->'app_metadata'->>'organization_id'
      );

    IF jwt_org_id IS NOT NULL AND jwt_org_id <> '' THEN
      NEW.org_id := jwt_org_id::uuid;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- ignore: app code should set org_id; this is backup
  END;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_invoice_org_id_trigger'
      AND tgrelid = 'public.invoices'::regclass
  ) THEN
    CREATE TRIGGER set_invoice_org_id_trigger
      BEFORE INSERT ON public.invoices
      FOR EACH ROW
      EXECUTE FUNCTION public.set_invoice_org_id();
  END IF;
END $$;

COMMENT ON FUNCTION public.set_invoice_org_id()
  IS 'Backup mechanism: sets org_id on invoice insert from JWT claims if org_id is NULL. App should set org_id explicitly.';

-- ======================================================
-- 9) invoice_settings (single table + trigger + RLS)
-- ======================================================
CREATE TABLE IF NOT EXISTS public.invoice_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  business_name TEXT DEFAULT '',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  bank_account_holder TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  bank_swift_code TEXT DEFAULT '',
  bank_account_number TEXT DEFAULT '',
  default_conditions TEXT DEFAULT '',
  default_exchange_rate TEXT DEFAULT '',
  default_currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- idempotent adds (in case older table exists)
ALTER TABLE public.invoice_settings ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE public.invoice_settings ADD COLUMN IF NOT EXISTS business_name TEXT DEFAULT '';
ALTER TABLE public.invoice_settings ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
ALTER TABLE public.invoice_settings ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE public.invoice_settings ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE public.invoice_settings ADD COLUMN IF NOT EXISTS bank_account_holder TEXT DEFAULT '';
ALTER TABLE public.invoice_settings ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT '';
ALTER TABLE public.invoice_settings ADD COLUMN IF NOT EXISTS bank_swift_code TEXT DEFAULT '';
ALTER TABLE public.invoice_settings ADD COLUMN IF NOT EXISTS bank_account_number TEXT DEFAULT '';
ALTER TABLE public.invoice_settings ADD COLUMN IF NOT EXISTS default_conditions TEXT DEFAULT '';
ALTER TABLE public.invoice_settings ADD COLUMN IF NOT EXISTS default_exchange_rate TEXT DEFAULT '';
ALTER TABLE public.invoice_settings ADD COLUMN IF NOT EXISTS default_currency TEXT DEFAULT 'USD';

CREATE INDEX IF NOT EXISTS idx_invoice_settings_org_id
  ON public.invoice_settings(org_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_invoice_settings_updated_at'
      AND tgrelid = 'public.invoice_settings'::regclass
  ) THEN
    CREATE TRIGGER update_invoice_settings_updated_at
      BEFORE UPDATE ON public.invoice_settings
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='invoice_settings'
      AND policyname='Allow all operations for authenticated users'
  ) THEN
    CREATE POLICY "Allow all operations for authenticated users"
      ON public.invoice_settings
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.invoice_settings IS 'Invoice settings table - stores company/bank information and default conditions for PDF generation';

-- ======================================================
-- 10) instrument_certificates + RLS + storage policies (NO DROP)
-- ======================================================
CREATE TABLE IF NOT EXISTS public.instrument_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID REFERENCES public.instruments(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size INTEGER,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_primary BOOLEAN DEFAULT false,
  version INTEGER DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS instrument_certificates_unique_path
  ON public.instrument_certificates(instrument_id, storage_path);

ALTER TABLE public.instrument_certificates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='instrument_certificates'
      AND policyname='Allow authenticated users to access instrument certificates'
  ) THEN
    CREATE POLICY "Allow authenticated users to access instrument certificates"
      ON public.instrument_certificates
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Storage policies (IMPORTANT: do NOT DROP existing policies)
-- Use app-specific policy names to avoid collisions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='hc_v_instrument_certificates_insert'
  ) THEN
    CREATE POLICY hc_v_instrument_certificates_insert
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'instrument-certificates');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='hc_v_instrument_certificates_select'
  ) THEN
    CREATE POLICY hc_v_instrument_certificates_select
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'instrument-certificates');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='hc_v_instrument_certificates_delete'
  ) THEN
    CREATE POLICY hc_v_instrument_certificates_delete
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'instrument-certificates');
  END IF;
END $$;

-- ============================================
-- End of combined migration
-- ============================================
