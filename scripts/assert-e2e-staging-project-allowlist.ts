/**
 * Fail-closed E2E target check: the Supabase URL must resolve to the
 * allowlisted staging project ref. Never logs URLs, keys, or refs.
 */
import {
  assertValidProjectRefFormat,
  extractProjectRefFromSupabaseUrl,
  normalizeProjectRefInput,
  type EnvMap,
} from './staging/env-guard';

export function assertE2EStagingProjectAllowlist(env: EnvMap = process.env): {
  matched: true;
} {
  const approvedRef = normalizeProjectRefInput(
    env.STAGING_SUPABASE_PROJECT_REF,
    'STAGING_SUPABASE_PROJECT_REF'
  );
  assertValidProjectRefFormat(approvedRef, 'STAGING_SUPABASE_PROJECT_REF');

  const supabaseUrl =
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() || env.SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    throw new Error(
      'Staging guard blocked: E2E Supabase URL is missing. Set STAGING_SUPABASE_URL.'
    );
  }

  const actualRef = extractProjectRefFromSupabaseUrl(supabaseUrl);
  if (!actualRef) {
    throw new Error(
      'Staging guard blocked: E2E Supabase URL project identity is missing or ambiguous.'
    );
  }

  if (actualRef !== approvedRef) {
    throw new Error(
      'Staging guard blocked: E2E Supabase URL project ref does not match STAGING_SUPABASE_PROJECT_REF.'
    );
  }

  const rawProductionRef = env.PRODUCTION_SUPABASE_PROJECT_REF;
  if (rawProductionRef != null && String(rawProductionRef).trim() !== '') {
    const productionRef = normalizeProjectRefInput(
      String(rawProductionRef),
      'PRODUCTION_SUPABASE_PROJECT_REF'
    );
    assertValidProjectRefFormat(
      productionRef,
      'PRODUCTION_SUPABASE_PROJECT_REF'
    );

    if (approvedRef === productionRef || actualRef === productionRef) {
      throw new Error(
        'Staging guard blocked: E2E Tests must not use the production Supabase project.'
      );
    }
  }

  return { matched: true };
}

if (require.main === module) {
  try {
    assertE2EStagingProjectAllowlist();
    console.log(
      'E2E Supabase URL project ref matches STAGING_SUPABASE_PROJECT_REF allowlist.'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
