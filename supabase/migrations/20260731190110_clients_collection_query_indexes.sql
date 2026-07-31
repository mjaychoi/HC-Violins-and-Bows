-- Indexes supporting server-side clients collection pagination, search, and
-- hasInstruments filtering. Added only for query patterns used by
-- GET /api/clients (paged) and GET /api/clients/analytics.
--
-- Pagination strategy: OFFSET/LIMIT (PostgREST .range). Expected scale for this
-- product is low-to-mid thousands of clients per org; deep OFFSET past tens of
-- thousands would degrade and is documented as a known limitation. Cursor
-- pagination was deferred to keep the existing page/pageSize UI contract.

-- Primary list order: org + created_at + id (stable secondary)
CREATE INDEX IF NOT EXISTS idx_clients_org_created_at_id
  ON public.clients (org_id, created_at DESC, id);

-- Name / email / phone search & sort within org
CREATE INDEX IF NOT EXISTS idx_clients_org_name
  ON public.clients (org_id, name);

CREATE INDEX IF NOT EXISTS idx_clients_org_email
  ON public.clients (org_id, email);

CREATE INDEX IF NOT EXISTS idx_clients_org_phone
  ON public.clients (org_id, phone);

CREATE INDEX IF NOT EXISTS idx_clients_org_first_name
  ON public.clients (org_id, first_name);

CREATE INDEX IF NOT EXISTS idx_clients_org_last_name
  ON public.clients (org_id, last_name);

-- hasInstruments filter: resolve client_ids with relationships in-org
CREATE INDEX IF NOT EXISTS idx_client_instruments_org_client_id
  ON public.client_instruments (org_id, client_id);

-- Analytics: sales aggregation scoped by org + non-null client
CREATE INDEX IF NOT EXISTS idx_sales_history_org_client_sale_date
  ON public.sales_history (org_id, client_id, sale_date DESC)
  WHERE client_id IS NOT NULL;
