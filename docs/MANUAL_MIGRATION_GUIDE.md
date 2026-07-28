# Manual Migration Guide (Deprecated)

> **This document is deprecated.** Do not follow the previous instructions in this file.
> For current deployment and schema migration procedures, use **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

## Canonical deployment path

Normal schema deployment uses the **checked-in versioned migrations** under `supabase/migrations/` and the repository deployment workflow described in [DEPLOYMENT.md](./DEPLOYMENT.md).

Do **not** apply schema changes by manually running SQL from:

- `supabase/migrations_backup/`
- `supabase/migrations_archive/`
- Root-level legacy SQL bundles (for example `migration-maintenance-tasks.sql`, `check_and_create_contact_logs.sql`)
- Old "complete" or "unified" SQL files (for example `maintenance_tasks_complete.sql`, `unified.sql`)

Do **not** manually reconstruct the schema by selecting historical migration fragments or mixing files from different eras.

## When manual SQL is acceptable

Manual SQL execution is an **exceptional operator procedure** and should only be considered when:

1. The **exact target environment** (development, staging, production) has been confirmed.
2. A **backup and recovery plan** is in place.
3. A **read-only preflight** has been run where applicable.
4. **Explicit approval** has been obtained from the team.
5. The change corresponds to an **exact, currently active forward migration** in `supabase/migrations/`.

Even then, prefer the automated migration workflow in [DEPLOYMENT.md](./DEPLOYMENT.md) whenever possible.

## Where to go next

- **Deployment and migration workflow:** [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Migration directory README:** [docs/migrations/README.md](./migrations/README.md)
- **Troubleshooting:** [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
