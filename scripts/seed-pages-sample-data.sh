#!/usr/bin/env bash

set -euo pipefail

# 페이지별 샘플 데이터 생성 스크립트
# - clients
# - instruments
# - client_instruments
# - maintenance_tasks
# - sales_history
# - contact_logs
# - invoices / invoice_items
#
# 사용법:
#   bash scripts/seed-pages-sample-data.sh
#
# 선택 환경변수(기본값):
#   CLIENTS_COUNT=40
#   INSTRUMENTS_COUNT=60
#   CONNECTIONS_COUNT=80
#   TASKS_COUNT=120
#   SALES_COUNT=40
#   CONTACTS_COUNT=80
#   INVOICES_COUNT=50

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f ".env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.local"
  set +a
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "❌ psql 명령을 찾을 수 없습니다. PostgreSQL client를 먼저 설치하세요."
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL 환경변수가 필요합니다."
  exit 1
fi

CLIENTS_COUNT="${CLIENTS_COUNT:-40}"
INSTRUMENTS_COUNT="${INSTRUMENTS_COUNT:-60}"
CONNECTIONS_COUNT="${CONNECTIONS_COUNT:-80}"
TASKS_COUNT="${TASKS_COUNT:-120}"
SALES_COUNT="${SALES_COUNT:-40}"
CONTACTS_COUNT="${CONTACTS_COUNT:-80}"
INVOICES_COUNT="${INVOICES_COUNT:-50}"

SEED_TAG="$(date +%s)"
echo "🌱 샘플 데이터 생성 시작 (seed_tag=${SEED_TAG})"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
BEGIN;

CREATE TEMP TABLE _seed_context AS
SELECT org_id
FROM (
  SELECT org_id FROM public.clients WHERE org_id IS NOT NULL
  UNION ALL
  SELECT org_id FROM public.instruments WHERE org_id IS NOT NULL
  UNION ALL
  SELECT org_id FROM public.invoices WHERE org_id IS NOT NULL
) s
LIMIT 1;

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _seed_context) THEN
    RAISE EXCEPTION 'No org_id found. Create at least one tenant-scoped row first.';
  END IF;
END
\$\$;

-- 1) clients
INSERT INTO public.clients (org_id, name, email, phone, client_number)
SELECT
  (SELECT org_id FROM _seed_context),
  format('Sample Client ${SEED_TAG}-%s', gs),
  format('sample.client.%s.%s@example.com', ${SEED_TAG}, gs),
  format('010-%s-%s', lpad(((random() * 9999)::int)::text, 4, '0'), lpad(((random() * 9999)::int)::text, 4, '0')),
  format('CL%s%s', right('${SEED_TAG}', 6), lpad(gs::text, 4, '0'))
FROM generate_series(1, ${CLIENTS_COUNT}) gs;

-- 2) instruments
INSERT INTO public.instruments (
  org_id,
  serial_number,
  maker,
  type,
  subtype,
  year,
  status,
  price,
  certificate,
  ownership,
  note
)
SELECT
  (SELECT org_id FROM _seed_context),
  format('SM%s%s', right('${SEED_TAG}', 6), lpad(gs::text, 6, '0')),
  (ARRAY['Stradivarius','Guarneri','Amati','Ruggeri','Vuillaume'])[(1 + floor(random() * 5))::int],
  (ARRAY['Violin','Viola','Cello','Bow'])[(1 + floor(random() * 4))::int],
  NULL,
  (1650 + floor(random() * 360))::int,
  (ARRAY['Available','Booked','Reserved','Maintenance'])[(1 + floor(random() * 4))::int],
  round((300000 + random() * 9000000)::numeric, 2),
  (random() > 0.35),
  NULL,
  format('Seed instrument %s', gs)
FROM generate_series(1, ${INSTRUMENTS_COUNT}) gs;

-- 3) client_instruments (중복은 건너뜀)
INSERT INTO public.client_instruments (
  client_id,
  instrument_id,
  relationship_type,
  notes
)
SELECT
  c.id,
  i.id,
  (ARRAY['Interested','Booked','Owned'])[(1 + floor(random() * 3))::int],
  format('seed relationship %s', gs)
FROM generate_series(1, ${CONNECTIONS_COUNT}) gs
CROSS JOIN LATERAL (
  SELECT id
  FROM public.clients
  WHERE org_id = (SELECT org_id FROM _seed_context)
  ORDER BY random()
  LIMIT 1
) c
CROSS JOIN LATERAL (
  SELECT id
  FROM public.instruments
  WHERE org_id = (SELECT org_id FROM _seed_context)
  ORDER BY random()
  LIMIT 1
) i
WHERE NOT EXISTS (
  SELECT 1
  FROM public.client_instruments ci
  WHERE ci.client_id = c.id
    AND ci.instrument_id = i.id
)
ON CONFLICT DO NOTHING;

-- 4) maintenance_tasks
INSERT INTO public.maintenance_tasks (
  org_id,
  instrument_id,
  client_id,
  task_type,
  title,
  description,
  status,
  priority,
  received_date,
  due_date,
  scheduled_date,
  estimated_hours,
  notes
)
SELECT
  (SELECT org_id FROM _seed_context),
  i.id,
  c.id,
  (ARRAY['repair','rehair','inspection','setup','maintenance'])[(1 + floor(random() * 5))::int],
  format('Seed Task %s', gs),
  'Generated sample maintenance task',
  (ARRAY['pending','in_progress','completed'])[(1 + floor(random() * 3))::int],
  (ARRAY['low','medium','high','urgent'])[(1 + floor(random() * 4))::int],
  (CURRENT_DATE - ((random() * 30)::int)),
  (CURRENT_DATE + ((random() * 45)::int)),
  (CURRENT_DATE + ((random() * 30)::int)),
  (1 + floor(random() * 8))::int,
  'Seed data'
FROM generate_series(1, ${TASKS_COUNT}) gs
CROSS JOIN LATERAL (
  SELECT id
  FROM public.instruments
  WHERE org_id = (SELECT org_id FROM _seed_context)
  ORDER BY random()
  LIMIT 1
) i
CROSS JOIN LATERAL (
  SELECT id
  FROM public.clients
  WHERE org_id = (SELECT org_id FROM _seed_context)
  ORDER BY random()
  LIMIT 1
) c;

-- 5) sales_history
INSERT INTO public.sales_history (
  org_id,
  instrument_id,
  client_id,
  sale_price,
  sale_date,
  notes,
  entry_kind
)
SELECT
  (SELECT org_id FROM _seed_context),
  i.id,
  c.id,
  round((500000 + random() * 12000000)::numeric, 2),
  (CURRENT_DATE - ((random() * 120)::int)),
  format('seed sale %s', gs),
  'sale'
FROM generate_series(1, ${SALES_COUNT}) gs
CROSS JOIN LATERAL (
  SELECT id
  FROM public.instruments
  WHERE org_id = (SELECT org_id FROM _seed_context)
  ORDER BY random()
  LIMIT 1
) i
CROSS JOIN LATERAL (
  SELECT id
  FROM public.clients
  WHERE org_id = (SELECT org_id FROM _seed_context)
  ORDER BY random()
  LIMIT 1
) c;

-- 6) contact_logs
INSERT INTO public.contact_logs (
  org_id,
  client_id,
  instrument_id,
  contact_type,
  subject,
  content,
  contact_date,
  purpose
)
SELECT
  (SELECT org_id FROM _seed_context),
  c.id,
  i.id,
  (ARRAY['email','phone','meeting','note','follow_up'])[(1 + floor(random() * 5))::int],
  format('Seed Contact %s', gs),
  'Generated sample contact log',
  (CURRENT_DATE - ((random() * 150)::int)),
  (ARRAY['quote','follow_up','maintenance','sale','inquiry'])[(1 + floor(random() * 5))::int]
FROM generate_series(1, ${CONTACTS_COUNT}) gs
CROSS JOIN LATERAL (
  SELECT id
  FROM public.clients
  WHERE org_id = (SELECT org_id FROM _seed_context)
  ORDER BY random()
  LIMIT 1
) c
CROSS JOIN LATERAL (
  SELECT id
  FROM public.instruments
  WHERE org_id = (SELECT org_id FROM _seed_context)
  ORDER BY random()
  LIMIT 1
) i;

-- 7) invoices + invoice_items
WITH inserted_invoices AS (
  INSERT INTO public.invoices (
    org_id,
    client_id,
    invoice_date,
    due_date,
    subtotal,
    tax,
    total,
    currency,
    status,
    notes
  )
  SELECT
    (SELECT org_id FROM _seed_context),
    c.id,
    (CURRENT_DATE - ((random() * 60)::int)),
    (CURRENT_DATE + ((random() * 45)::int)),
    round((300 + random() * 3000)::numeric, 2),
    round((30 + random() * 300)::numeric, 2),
    round((330 + random() * 3300)::numeric, 2),
    'USD',
    (ARRAY['draft','sent','paid','overdue'])[(1 + floor(random() * 4))::int],
    format('Seed invoice %s', gs)
  FROM generate_series(1, ${INVOICES_COUNT}) gs
  CROSS JOIN LATERAL (
    SELECT id
    FROM public.clients
    WHERE org_id = (SELECT org_id FROM _seed_context)
    ORDER BY random()
    LIMIT 1
  ) c
  RETURNING id
)
INSERT INTO public.invoice_items (
  invoice_id,
  instrument_id,
  description,
  qty,
  rate,
  amount,
  image_url,
  display_order
)
SELECT
  inv.id,
  i.id,
  format('Seed Item %s-%s', inv.id, item_idx),
  (1 + floor(random() * 3))::int,
  round((50 + random() * 600)::numeric, 2),
  round(((1 + floor(random() * 3))::int * (50 + random() * 600))::numeric, 2),
  NULL,
  item_idx
FROM inserted_invoices inv
CROSS JOIN LATERAL generate_series(1, (1 + floor(random() * 3))::int) item_idx
CROSS JOIN LATERAL (
  SELECT id
  FROM public.instruments
  WHERE org_id = (SELECT org_id FROM _seed_context)
  ORDER BY random()
  LIMIT 1
) i;

COMMIT;
SQL

echo "✅ 샘플 데이터 생성 완료"
echo "   - clients:          ${CLIENTS_COUNT}"
echo "   - instruments:      ${INSTRUMENTS_COUNT}"
echo "   - connections:      ${CONNECTIONS_COUNT} (중복 조합은 일부 skip 가능)"
echo "   - maintenanceTasks: ${TASKS_COUNT}"
echo "   - salesHistory:     ${SALES_COUNT}"
echo "   - contactLogs:      ${CONTACTS_COUNT}"
echo "   - invoices:         ${INVOICES_COUNT}"
