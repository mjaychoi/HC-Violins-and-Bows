-- client_number is tenant-scoped: same label (e.g. CL001) may exist in different orgs.
-- Replaces the previous unique index on client_number alone.

DROP INDEX IF EXISTS public.idx_clients_client_number;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_org_id_client_number
  ON public.clients (org_id, client_number)
  WHERE client_number IS NOT NULL;

-- Max numeric suffix for standard CL######## numbers within one org. Invalid/legacy
-- values are ignored for the purpose of choosing the next CL number.
CREATE OR REPLACE FUNCTION public.max_cl_suffix_for_org(p_org_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    MAX(
      CASE
        WHEN c.client_number IS NOT NULL
          AND c.client_number ~* '^cl[0-9]+$' THEN
          (regexp_match(c.client_number, '^CL([0-9]+)$', 'i'))[1]::integer
        ELSE NULL
      END
    ),
    0
  )
  FROM public.clients c
  WHERE c.org_id = p_org_id;
$$;

REVOKE ALL ON FUNCTION public.max_cl_suffix_for_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.max_cl_suffix_for_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.max_cl_suffix_for_org(uuid) TO service_role;

COMMENT ON FUNCTION public.max_cl_suffix_for_org(uuid) IS
  'Max numeric suffix of CL* client_number values for an org. Used to allocate the next number server-side.';
