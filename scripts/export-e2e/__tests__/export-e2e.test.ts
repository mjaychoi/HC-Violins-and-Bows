/** @jest-environment node */

import { readFileSync } from 'fs';
import { join } from 'path';

import { generateItemCSV } from '../../../src/app/dashboard/utils/itemCsvExport';
import { generateCSV } from '../../../src/app/sales/utils/salesUtils';
import {
  currency,
  dateFormat,
} from '../../../src/app/sales/utils/salesFormatters';
import { todayLocalYMD } from '../../../src/utils/dateParsing';
import type { Instrument } from '../../../src/types';
import {
  assertItemAdminCsv,
  assertMemberExportBlocked,
  assertSalesAdminCsv,
} from '../assertions';
import {
  APPROVED_STAGING_PROJECT_REF,
  EXPECTED_ITEM_CSV_HEADERS,
  EXPECTED_SALES_CSV_HEADERS,
  EXPORT_E2E_ITEM_CONSIGNMENT_PRICE,
  EXPORT_E2E_ITEM_COST_PRICE,
  EXPORT_E2E_KEEP_SALE_PRICE,
  REQUIRED_EXPORT_CASE_IDS,
  createExportFixtureMarkers,
} from '../constants';
import { parseCsv } from '../csv';
import { assertExportE2EEnvironment } from '../env-guard';
import { classifyExportRun } from '../report';

const root = join(__dirname, '../../..');

describe('export e2e guard', () => {
  const productionProjectRef = 'prodrefexample9999';
  const valid = {
    stagingProjectRef: APPROVED_STAGING_PROJECT_REF,
    productionProjectRef,
    supabaseUrl: `https://${APPROVED_STAGING_PROJECT_REF}.supabase.co`,
    supabaseAnonKey: 'anon-key',
    serviceRoleKey: 'service-key',
    appBaseUrl: 'https://hc-violins-staging.vercel.app',
  };

  it('accepts only the approved staging app and project', () => {
    const env = assertExportE2EEnvironment(valid);
    expect(env.stagingProjectRef).toBe(APPROVED_STAGING_PROJECT_REF);
    expect(env.appBaseUrl).toBe('https://hc-violins-staging.vercel.app');
  });

  it('rejects a non-approved staging ref, production ref, and production host', () => {
    expect(() =>
      assertExportE2EEnvironment({
        ...valid,
        stagingProjectRef: 'otherexampleref0001',
        supabaseUrl: 'https://otherexampleref0001.supabase.co',
      })
    ).toThrow(/approved hosted staging/i);

    expect(() =>
      assertExportE2EEnvironment({
        ...valid,
        productionProjectRef: APPROVED_STAGING_PROJECT_REF,
      })
    ).toThrow(/production ref/i);

    expect(() =>
      assertExportE2EEnvironment({
        ...valid,
        supabaseUrl: `https://${productionProjectRef}.supabase.co`,
        stagingProjectRef: productionProjectRef,
      })
    ).toThrow(/approved hosted staging|production/i);

    expect(() =>
      assertExportE2EEnvironment({
        ...valid,
        appBaseUrl: 'https://hc-violins-and-bows.vercel.app',
      })
    ).toThrow(/production host|approved hosted staging application/i);

    expect(() =>
      assertExportE2EEnvironment({ ...valid, nodeEnv: 'production' })
    ).toThrow(/NODE_ENV/i);
  });
});

describe('export csv contract', () => {
  const markers = createExportFixtureMarkers('runaaaaaaaaaaaaaaaaaaaa');

  it('parses quotes, commas, newlines, and formula escapes', () => {
    const parsed = parseCsv(
      '"Item Number",Note\n"\'=EX1","line1\n""quoted"", 바이올린"\n'
    );
    expect(parsed.headers).toEqual(['Item Number', 'Note']);
    expect(parsed.rows[0]?.['Item Number']).toBe("'=EX1");
    expect(parsed.rows[0]?.Note).toBe('line1\n"quoted", 바이올린');
  });

  it('matches the current item encoder and hides sensitive fields', () => {
    const item = {
      serial_number: markers.keepSerial,
      maker: markers.keepMaker,
      type: markers.keepType,
      year: 1721,
      price: 4321.5,
      certificate: true,
      certificate_name: markers.certificateName,
      note: markers.keepNote,
      status: 'Available',
      cost_price: EXPORT_E2E_ITEM_COST_PRICE,
      consignment_price: EXPORT_E2E_ITEM_CONSIGNMENT_PRICE,
      reserved_by_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      reserved_connection_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    } as Instrument;
    const csv = generateItemCSV([item]);
    expect(parseCsv(csv).headers).toEqual([...EXPECTED_ITEM_CSV_HEADERS]);
    expect(() =>
      assertItemAdminCsv({
        filename: `items-${todayLocalYMD()}.csv`,
        csv,
        markers,
        reservedUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        reservedConnectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      })
    ).not.toThrow();
  });

  it('matches the current sales encoder column order', () => {
    const csv = generateCSV(
      [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          sale_date: '2020-03-15',
          sale_price: EXPORT_E2E_KEEP_SALE_PRICE,
          notes: markers.keepSaleNote,
          client: {
            first_name: 'Export',
            last_name: 'KeepA',
            email: markers.orgAClientEmail,
          },
          instrument: {
            maker: markers.keepMaker,
            type: markers.keepType,
            subtype: null,
          },
        } as never,
      ],
      dateFormat,
      currency
    );
    expect(parseCsv(csv).headers).toEqual([...EXPECTED_SALES_CSV_HEADERS]);
    expect(() =>
      assertSalesAdminCsv({
        filename: 'sales-history-20200315-20200315.csv',
        csv,
        markers,
        keepSaleId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      })
    ).not.toThrow();
  });

  it('records item export as absent and sales export as disabled', () => {
    expect(
      assertMemberExportBlocked({
        surface: 'item',
        buttonCount: 0,
        disabled: null,
        title: null,
      })
    ).toBe('absent');
    expect(
      assertMemberExportBlocked({
        surface: 'sales',
        buttonCount: 1,
        disabled: true,
        title: 'Admin only',
      })
    ).toBe('disabled');
  });
});

describe('export run classification', () => {
  it('passes only when every required case succeeded', () => {
    const cases = REQUIRED_EXPORT_CASE_IDS.map(id => ({
      id,
      ok: true,
      detail: 'ok',
    }));
    expect(classifyExportRun(cases).classification).toBe(
      'EXPORT_STAGING_E2E_PASS'
    );
    cases[0] = { ...cases[0], ok: false };
    expect(classifyExportRun(cases).classification).toBe(
      'EXPORT_STAGING_E2E_FAIL'
    );
  });

  it('keeps fixture markers scoped to the run id', () => {
    const markers = createExportFixtureMarkers('runbbbbbbbbbbbbbbbbbbbb');
    expect(markers.keepSerial).toContain('runbbbbbbbbbbbbbbbbbbbb');
    expect(markers.orgBSaleNote).toContain('runbbbbbbbbbbbbbbbbbbbb');
    expect(markers.keepSerial).not.toContain('runaaaaaaaaaaaaaaaaaaaa');
  });
});

describe('export workflow gate', () => {
  const workflow = readFileSync(
    join(root, '.github/workflows/hosted-staging-integration.yml'),
    'utf8'
  );

  it('runs export E2E only when explicitly requested and skips database mutation jobs', () => {
    expect(workflow).toContain('export_e2e_only:');
    expect(workflow).toContain("default: 'no'");
    expect(workflow).toContain('export-e2e:');
    expect(workflow).toContain('scripts/export-e2e/run-hosted-export-e2e.ts');
    expect(workflow).toContain('scripts/export-e2e/cleanup-fixtures.ts');
    expect(workflow).toContain("github.event.inputs.export_e2e_only != 'yes'");
    const exportJob = workflow.slice(workflow.indexOf('export-e2e:'));
    expect(exportJob).toContain("github.event.inputs.export_e2e_only == 'yes'");
    expect(exportJob).not.toContain('supabase db push');
    expect(exportJob).not.toContain('db reset');
    expect(exportJob).not.toContain('SYNTHETIC_READY');
  });

  it('does not load local production env from the hosted runner', () => {
    const runner = readFileSync(
      join(root, 'scripts/export-e2e/run-hosted-export-e2e.ts'),
      'utf8'
    );
    expect(runner).not.toContain('.env.local');
    expect(runner).not.toContain('db push');
    expect(runner).not.toContain('db reset');
    expect(runner).toContain('CURRENT_IMPLEMENTATION_NO_EXPORT_AUDIT');
    const browser = readFileSync(
      join(root, 'scripts/export-e2e/browser.ts'),
      'utf8'
    );
    expect(browser).toContain('Search items by maker, type, serial...');
    expect(browser).toContain("getByRole('link'");
    expect(browser).not.toContain("getByLabel('Search items')");
  });
});
