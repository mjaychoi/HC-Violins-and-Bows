# Demo Seed Data

`scripts/seed-demo-data.ts` creates fake, repeatable demo data for manual QA of
the inventory app. It is development-only and refuses to run in production.

## Requirements

Set these in `.env.local` or your shell:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=your-local-service-role-key
SEED_DEMO_ORG_ID=11111111-1111-4111-8111-111111111111
SEED_DEMO_USER_ID=22222222-2222-4222-8222-222222222222
```

You can also pass the IDs as CLI args. CLI args override env vars:

```bash
npm run seed:demo:dry-run -- --org-id "<org-id>" --user-id "<user-id>"
```

`SEED_DEMO_ORG_ID` must exist in `public.organizations` and
`SEED_DEMO_USER_ID` must exist in `auth.users` before confirmed seed/reset runs.
Dry-run can still plan rows when the identity is missing, but it will warn.

Hosted Supabase URLs require `--allow-remote-dev`. Use it only for disposable
hosted dev databases. Never use it against production-like data, production
secrets, or a production project. Never commit or print
`SUPABASE_SERVICE_ROLE_KEY`.

## Commands

```bash
npm run seed:demo:doctor -- --org-id "<org-id>" --user-id "<user-id>"
npm run seed:demo:identity -- --org-id "<org-id>" --user-id "<user-id>"
npm run seed:demo:dry-run -- --org-id "<org-id>" --user-id "<user-id>"
npm run seed:demo -- --confirm --org-id "<org-id>" --user-id "<user-id>"
npm run seed:demo:reset -- --confirm --org-id "<org-id>" --user-id "<user-id>"
```

`seed:data` is kept as a compatibility alias for `seed:demo`.

Legacy scripts `scripts/seed-sample-data.ts`,
`scripts/generate-sample-data.ts`, and `scripts/seed-pages-sample-data.sh` are
deprecated and intentionally exit with an error. Do not use them for manual QA.

## What Gets Created

The script generates deterministic UUIDs and upserts:

- 64 instruments
- 44 clients
- 88 client-instrument connections
- 44 sales records, including refund/adjustment rows
- 38 invoices plus invoice items
- 76 maintenance tasks
- 92 contact logs
- instrument image and certificate metadata
- invoice settings when no non-demo settings row exists
- notification settings when the demo user has no settings row

Rows are marked with `[DEMO_SEED]` in notes/content/business fields where the
schema has a safe marker column. Reset deletes only deterministic seeded row IDs.
Existing non-demo invoice or notification settings are not overwritten or
deleted.

## Doctor And Identity Setup

Doctor mode never writes data. It prints a safe summary of the configured
Supabase URL, whether the service role key is present, whether the URL is local,
and whether the target org/user rows exist. It does not print secrets.

```bash
npm run seed:demo:doctor -- --org-id "<org-id>" --user-id "<user-id>"
```

For a fresh local reset, create the deterministic demo identity first:

```bash
npm run seed:demo:identity -- --org-id "11111111-1111-4111-8111-111111111111" --user-id "22222222-2222-4222-8222-222222222222"
```

Identity setup is local-only by default. It creates or upserts:

- `public.organizations` with the target `org_id`
- `auth.users` with the target `user_id`, fake email
  `demo-seed-user@example.test`, confirmed email, and admin org app metadata

Use `--allow-remote-dev` only for disposable hosted dev databases. Never use it
against production-like data. The generated local-only password is not printed.

## Local Full Seed Cycle

After `supabase start`:

```bash
npm run seed:demo:doctor -- --org-id "<org-id>" --user-id "<user-id>"
npm run seed:demo:identity -- --org-id "<org-id>" --user-id "<user-id>"
npm run seed:demo:dry-run -- --org-id "<org-id>" --user-id "<user-id>"
npm run seed:demo -- --confirm --org-id "<org-id>" --user-id "<user-id>"
npm run seed:demo -- --confirm --org-id "<org-id>" --user-id "<user-id>"
npm run seed:demo:reset -- --confirm --org-id "<org-id>" --user-id "<user-id>"
npm run seed:demo -- --confirm --org-id "<org-id>" --user-id "<user-id>"
```

The second seed should not increase deterministic seeded counts. Reset deletes
only deterministic seeded rows and preserves non-demo rows, then the final seed
restores the planned counts.

## Safety

The script refuses to run unless:

- `NODE_ENV !== production`
- Supabase URL and service role key are present
- target org and user IDs are explicit
- non-dry-run execution includes `--confirm` or `--reset`
- hosted Supabase URLs include `--allow-remote-dev`

Reset mode deletes seeded rows only. It does not truncate tables and does not
delete arbitrary org data.

## Troubleshooting

- `Target org/user does not exist`: run `npm run seed:demo:identity`, or pass
  existing local org/user IDs.
- `Remote Supabase URLs require --allow-remote-dev`: verify the project is a
  disposable hosted dev database with no production-like data, then pass the
  flag.
- Foreign-key errors usually mean the target org or user does not exist, or a
  referenced deterministic row was manually deleted.
- Unique invoice or serial errors indicate manually inserted data reused a demo
  number. Run `npm run seed:demo:reset -- --confirm --org-id "<org-id>" --user-id "<user-id>"`
  and try again.

## Manual QA Checklist

- `/dashboard` shows populated inventory and KPI cards.
- `/clients` has 40+ clients; search, filters, and pagination work.
- Client detail modal shows connections and contact logs.
- `/connections` shows multiple relationship sections and sortable rows.
- `/sales` has sales across current month, prior month, and prior year.
- `/invoices` has draft, sent, paid, overdue, and cancelled invoices.
- Invoice PDF route can load for the printed `invoicePdfCandidate`.
- `/calendar` shows overdue, today, tomorrow, dense-day, and future tasks.
- Invoice settings page loads demo settings unless existing non-demo settings
  were preserved.
- Notification settings page loads for the demo user.
- Pagination, filtering, sorting, and update/delete flows still work on major
  pages.
