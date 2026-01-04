-- Random invoice_number generation + UNIQUE constraint + DEFAULT
-- Safe-ish to re-run (guards included)

-- 0) Dependencies
create extension if not exists pgcrypto;

-- 1) Ensure invoice_number column exists (optional; uncomment if needed)
-- alter table public.invoices add column if not exists invoice_number text;

-- 2) Generator function (INV_ + 12 hex chars)
create or replace function public.generate_invoice_number()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := 'INV_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

    -- collision check (very unlikely, but deterministic safety)
    if not exists (
      select 1 from public.invoices where invoice_number = candidate
    ) then
      return candidate;
    end if;
  end loop;
end;
$$;

-- 3) Backfill existing rows that have NULL/empty invoice_number
update public.invoices
set invoice_number = public.generate_invoice_number()
where invoice_number is null
   or length(trim(invoice_number)) = 0;

-- 4) Set DEFAULT so new inserts auto-fill invoice_number
alter table public.invoices
  alter column invoice_number set default public.generate_invoice_number();

-- 5) Add UNIQUE constraint (guard: only add if not exists)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_invoice_number_unique'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_invoice_number_unique unique (invoice_number);
  end if;
end $$;

-- 6) Optional: enforce NOT NULL after backfill
-- (only do this if you are sure every row should have invoice_number)
-- alter table public.invoices
--   alter column invoice_number set not null;
