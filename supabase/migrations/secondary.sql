-- =========================================================
-- CONTACT_LOGS + INVOICES ORG_ID DEBUG (Single Combined)
-- Safe to re-run (idempotent-ish)
-- Run in Supabase Dashboard > SQL Editor
-- =========================================================

-- 0) (Optional) Ensure pgcrypto exists for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Common updated_at trigger function (define once)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- A) contact_logs (create/upgrade + FK normalize + indexes + trigger + RLS)
-- =========================================================

-- A1) Create table if missing (schema-qualified)
CREATE TABLE IF NOT EXISTS public.contact_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id UUID,
  instrument_id UUID,

  contact_type TEXT NOT NULL CHECK (contact_type IN (
    'email', 'phone', 'meeting', 'note', 'follow_up'
  )),

  subject TEXT,
  content TEXT NOT NULL,
  contact_date DATE NOT NULL,
  next_follow_up_date DATE,
  follow_up_completed_at TIMESTAMPTZ,
  purpose TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A2) Ensure columns exist (if table existed with partial schema)
ALTER TABLE public.contact_logs ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE public.contact_logs ADD COLUMN IF NOT EXISTS instrument_id UUID;
ALTER TABLE public.contact_logs ADD COLUMN IF NOT EXISTS contact_type TEXT;
ALTER TABLE public.contact_logs ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.contact_logs ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE public.contact_logs ADD COLUMN IF NOT EXISTS contact_date DATE;
ALTER TABLE public.contact_logs ADD COLUMN IF NOT EXISTS next_follow_up_date DATE;
ALTER TABLE public.contact_logs ADD COLUMN IF NOT EXISTS follow_up_completed_at TIMESTAMPTZ;
ALTER TABLE public.contact_logs ADD COLUMN IF NOT EXISTS purpose TEXT;
ALTER TABLE public.contact_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.contact_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- A3) Normalize foreign keys:
-- Drop ANY existing FK constraints on client_id/instrument_id (regardless of name),
-- then re-add with the exact names you want.
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop all FK constraints on contact_logs
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.contact_logs'::regclass
      AND contype = 'f'
  LOOP
    EXECUTE 'ALTER TABLE public.contact_logs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;

  -- Re-add properly named FK constraints (idempotent guards)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contact_logs_client_id_fkey'
      AND conrelid = 'public.contact_logs'::regclass
  ) THEN
    EXECUTE $sql$
      ALTER TABLE public.contact_logs
      ADD CONSTRAINT contact_logs_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE
    $sql$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contact_logs_instrument_id_fkey'
      AND conrelid = 'public.contact_logs'::regclass
  ) THEN
    EXECUTE $sql$
      ALTER TABLE public.contact_logs
      ADD CONSTRAINT contact_logs_instrument_id_fkey
      FOREIGN KEY (instrument_id) REFERENCES public.instruments(id) ON DELETE SET NULL
    $sql$;
  END IF;
END $$;

-- A4) Indexes
CREATE INDEX IF NOT EXISTS idx_contact_logs_client_id
  ON public.contact_logs(client_id);

CREATE INDEX IF NOT EXISTS idx_contact_logs_instrument_id
  ON public.contact_logs(instrument_id);

CREATE INDEX IF NOT EXISTS idx_contact_logs_contact_date
  ON public.contact_logs(contact_date);

CREATE INDEX IF NOT EXISTS idx_contact_logs_next_follow_up_date
  ON public.contact_logs(next_follow_up_date);

CREATE INDEX IF NOT EXISTS idx_contact_logs_contact_type
  ON public.contact_logs(contact_type);

CREATE INDEX IF NOT EXISTS idx_contact_logs_follow_up_completed_at
  ON public.contact_logs(follow_up_completed_at)
  WHERE follow_up_completed_at IS NULL;

-- A5) updated_at trigger (idempotent)
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

-- A6) RLS + policy (idempotent)
ALTER TABLE public.contact_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename='contact_logs'
      AND policyname='Allow all operations for authenticated users'
  ) THEN
    CREATE POLICY "Allow all operations for authenticated users"
      ON public.contact_logs
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- A7) Comments
COMMENT ON TABLE public.contact_logs IS '고객과의 연락 기록 및 Follow-up 일정을 추적하는 테이블';
COMMENT ON COLUMN public.contact_logs.contact_type IS '연락 유형 (email, phone, meeting, note, follow_up)';
COMMENT ON COLUMN public.contact_logs.contact_date IS '연락한 날짜';
COMMENT ON COLUMN public.contact_logs.next_follow_up_date IS '다음 연락 예정일 (Follow-up)';
COMMENT ON COLUMN public.contact_logs.purpose IS '연락 목적 (quote, follow_up, maintenance, sale 등)';
COMMENT ON COLUMN public.contact_logs.follow_up_completed_at IS 'Follow-up 완료 처리 시각 (null이면 미완료)';

-- A8) Verify contact_logs columns quickly
SELECT
  column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'contact_logs'
ORDER BY ordinal_position;

-- =========================================================
-- B) invoices org_id debug helpers (읽기 전용 쿼리들)
-- =========================================================

-- B1) Total invoices count
SELECT COUNT(*) as total_invoices FROM public.invoices;

-- B2) invoices org_id null distribution
SELECT
  COUNT(*) as count,
  (org_id IS NULL) as is_null
FROM public.invoices
GROUP BY (org_id IS NULL);

-- B3) sample invoices
SELECT
  id,
  invoice_number,
  org_id,
  client_id,
  invoice_date,
  status,
  created_at
FROM public.invoices
ORDER BY created_at DESC
LIMIT 10;

-- B4) invoices with NULL org_id sample
SELECT
  id,
  invoice_number,
  org_id,
  client_id,
  invoice_date,
  status
FROM public.invoices
WHERE org_id IS NULL
LIMIT 10;

-- =========================================================
-- C) org_id 찾기 (옵션)
-- =========================================================
-- ⚠️ 아래 이메일을 네 계정 이메일로 바꿔서 실행
-- SELECT
--   id as user_id,
--   email,
--   raw_user_meta_data->>'org_id' as org_id_from_user_metadata,
--   raw_user_meta_data->>'organization_id' as organization_id_from_user_metadata,
--   raw_app_meta_data->>'org_id' as org_id_from_app_metadata,
--   raw_app_meta_data->>'organization_id' as organization_id_from_app_metadata
-- FROM auth.users
-- WHERE email = 'test@test.com';

-- =========================================================
-- D) invoices org_id 백필 (옵션, 조심)
-- =========================================================
-- ⚠️ 아래는 "NULL org_id인 invoice 전부"를 특정 org_id로 채움
-- ⚠️ 멀티 org면 조건 더 걸어야 함(예: created_by/user_id, client_id 등)
-- UPDATE public.invoices
-- SET org_id = 'YOUR-ORG-ID-HERE'::uuid
-- WHERE org_id IS NULL;

-- Verify after backfill
-- SELECT
--   COUNT(*) as total_invoices,
--   COUNT(org_id) as invoices_with_org_id,
--   COUNT(*) - COUNT(org_id) as invoices_without_org_id
-- FROM public.invoices;
