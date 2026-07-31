# Clients collection pagination — query evidence (2026-08-01)

## Collection API contract

`GET /api/clients` (ordinary list — **no** `all=true`):

| Param                          | Notes                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `page`                         | 1-based, default 1; invalid → normalize to 1                                                       |
| `pageSize` / `page_size`       | default 20, max 100                                                                                |
| `search`                       | shared `sanitizeSearchForOrIlike` + `escapePostgrestFilterValue`                                   |
| `orderBy` / `sort_by`          | allowlisted via `validateSortColumn('clients')`                                                    |
| `ascending` / `sort_direction` | allowlisted                                                                                        |
| filters                        | `last_name`, `first_name`, `email`, `contact_number`/`phone`, `tags`, `interest`, `hasInstruments` |

Response:

```json
{
  "data": [],
  "count": 1001,
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalCount": 1001,
    "totalPages": 51
  },
  "has_more": true,
  "truncated": false,
  "scope": "paged"
}
```

`all=true` remains for **internal directory** callers only (hard cap 1000 + `truncated`). `/clients` list uses `useClientCollection` and never `all=true`.

## Pagination strategy

Offset/`range` pagination matching invoices/instruments. Expected org scale: low-to-mid thousands. Deep OFFSET beyond tens of thousands is a known limitation; cursor pagination deferred to preserve page UI.

Ordering: primary allowlisted column + stable secondary `id ASC`.

## Indexes added

Migration `20260731190110_clients_collection_query_indexes.sql`:

- `idx_clients_org_created_at_id`
- `idx_clients_org_name` / `email` / `phone` / `first_name` / `last_name`
- `idx_client_instruments_org_client_id`
- `idx_sales_history_org_client_sale_date` (partial, `client_id IS NOT NULL`)

## Query-plan evidence

**NOT MEASURED** in this environment:

- Docker is available, but the Supabase CLI is not installed as a global binary in PATH for live `EXPLAIN` against a seeded local stack in this worktree session.
- Claims below remain unit/integration verified only.

Generated PostgREST shape (paged):

```text
GET /rest/v1/clients?select=...&org_id=eq.<org>&or=(name.ilike.*..*)&order=created_at.desc,id.asc&offset=N&limit=pageSize
```

## Analytics

`GET /api/clients/analytics` — org-scoped complete metrics (not list-page scoped).

## Live Supabase / Playwright

Recorded as **NOT VERIFIED** in the batch completion report when local Supabase/Playwright cannot run cleanly in this environment.
