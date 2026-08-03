/** @jest-environment node */

import * as fs from 'fs';
import {
  assertNonProductionAuthMatrixEnv,
  isAuthMatrixEnabled,
  loadAuthMatrixEnvironment,
} from './env-guard';
import { PRODUCTION_SUPABASE_PROJECT_REF_ENV } from '../../../scripts/staging/env-guard';

/** Synthetic refs only — never use a real project identifier in fixtures. */
const stagingRef = 'stagingexample1234';
const productionRef = 'prodrefexample9999';

describe('auth matrix env guard', () => {
  it('is disabled unless AUTH_MATRIX_ENABLED=1', () => {
    expect(isAuthMatrixEnabled()).toBe(false);
  });

  it('aborts when Supabase project ref matches configured production ref', () => {
    expect(() =>
      assertNonProductionAuthMatrixEnv({
        supabaseUrl: `https://${productionRef}.supabase.co`,
        supabaseAnonKey: 'anon',
        serviceRoleKey: 'service',
        baseUrl: 'http://127.0.0.1:3000',
        productionProjectRef: productionRef,
      })
    ).toThrow(/production/i);
  });

  it('requires production project ref when hosted/CI mode is forced', () => {
    expect(() =>
      assertNonProductionAuthMatrixEnv(
        {
          supabaseUrl: `https://${stagingRef}.supabase.co`,
          supabaseAnonKey: 'anon',
          serviceRoleKey: 'service',
          baseUrl: 'http://127.0.0.1:3000',
        },
        { requireProductionProjectRef: true }
      )
    ).toThrow(new RegExp(PRODUCTION_SUPABASE_PROJECT_REF_ENV));
  });

  it('loads staging environment when enabled and non-production', () => {
    const previousEnabled = process.env.AUTH_MATRIX_ENABLED;
    const previousUrl = process.env.AUTH_MATRIX_SUPABASE_URL;
    const previousAnon = process.env.AUTH_MATRIX_SUPABASE_ANON_KEY;
    const previousService = process.env.AUTH_MATRIX_SERVICE_ROLE_KEY;
    const previousBase = process.env.AUTH_MATRIX_BASE_URL;
    const previousProd = process.env[PRODUCTION_SUPABASE_PROJECT_REF_ENV];

    process.env.AUTH_MATRIX_ENABLED = '1';
    process.env.AUTH_MATRIX_SUPABASE_URL = `https://${stagingRef}.supabase.co`;
    process.env.AUTH_MATRIX_SUPABASE_ANON_KEY = 'anon-key';
    process.env.AUTH_MATRIX_SERVICE_ROLE_KEY = 'service-key';
    process.env.AUTH_MATRIX_BASE_URL = 'http://127.0.0.1:3000';
    process.env[PRODUCTION_SUPABASE_PROJECT_REF_ENV] = productionRef;

    try {
      const env = loadAuthMatrixEnvironment();
      expect(env?.projectRef).toBe(stagingRef);
      expect(env?.productionProjectRef).toBe(productionRef);
    } finally {
      process.env.AUTH_MATRIX_ENABLED = previousEnabled;
      process.env.AUTH_MATRIX_SUPABASE_URL = previousUrl;
      process.env.AUTH_MATRIX_SUPABASE_ANON_KEY = previousAnon;
      process.env.AUTH_MATRIX_SERVICE_ROLE_KEY = previousService;
      process.env.AUTH_MATRIX_BASE_URL = previousBase;
      if (previousProd === undefined) {
        delete process.env[PRODUCTION_SUPABASE_PROJECT_REF_ENV];
      } else {
        process.env[PRODUCTION_SUPABASE_PROJECT_REF_ENV] = previousProd;
      }
    }
  });

  it('does not embed a real production project ref in this test module', () => {
    const source = fs.readFileSync(__filename, 'utf8');
    const formerHardCodedRef = [
      'dmi',
      'lml',
      'hqu',
      'ttc',
      'ozx',
      'lpf',
      'xw',
    ].join('');
    expect(source).not.toContain(formerHardCodedRef);
  });
});
