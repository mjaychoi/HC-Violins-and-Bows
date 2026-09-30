/**
 * Approved hosted staging identity for export E2E.
 * This is the staging project ref (not a secret and not the production ref).
 * Production is never hard-coded; it is supplied only as a deny target.
 */
export const APPROVED_STAGING_PROJECT_REF = 'lwhyvscrhfiuxvrmmrhs';

export const APPROVED_STAGING_APP_HOSTNAME = 'hc-violins-staging.vercel.app';

export const EXPECTED_ITEM_CSV_HEADERS = [
  'Item Number',
  'Maker',
  'Type',
  'Year',
  'Retail Price',
  'Certificate',
  'Note',
  'Status',
] as const;

export const EXPECTED_SALES_CSV_HEADERS = [
  'Date',
  'Sale ID',
  'Client Name',
  'Client Email',
  'Instrument',
  'Amount',
  'Status',
  'Notes',
] as const;

export const EXPORT_E2E_KEEP_SALE_DATE = '2020-03-15';
export const EXPORT_E2E_DROP_SALE_DATE = '2021-08-02';

export const EXPORT_E2E_ITEM_RETAIL_PRICE = 4321.5;
export const EXPORT_E2E_ITEM_COST_PRICE = 91827.61;
export const EXPORT_E2E_ITEM_CONSIGNMENT_PRICE = 82716.52;
export const EXPORT_E2E_KEEP_SALE_PRICE = 1500.25;
export const EXPORT_E2E_DROP_SALE_PRICE = 2600.5;
export const EXPORT_E2E_ORG_B_SALE_PRICE = 3700.75;
export const EXPORT_E2E_ORG_B_ITEM_RETAIL_PRICE = 6543.25;
export const EXPORT_E2E_ORG_B_ITEM_COST_PRICE = 71615.43;
export const EXPORT_E2E_ORG_B_ITEM_CONSIGNMENT_PRICE = 61514.32;

export const REQUIRED_EXPORT_CASE_IDS = [
  'item-admin-ui',
  'item-member-ui',
  'sales-admin-api',
  'sales-admin-ui',
  'sales-member-api',
  'sales-member-ui',
  'sales-invalid-filter',
  'isolation-org-a-api',
  'isolation-org-b-api',
  'isolation-org-a-csv',
  'isolation-org-b-csv',
  'cleanup-residuals',
] as const;

export type RequiredExportCaseId = (typeof REQUIRED_EXPORT_CASE_IDS)[number];

export type ExportCaseResult = {
  id: string;
  ok: boolean;
  detail: string;
};

export function exportRunToken(runId: string): string {
  return `EX${runId}`;
}

export type ExportFixtureMarkers = {
  token: string;
  keepSerial: string;
  dropSerial: string;
  orgBSerial: string;
  keepMaker: string;
  dropMaker: string;
  orgBMaker: string;
  keepType: string;
  certificateName: string;
  keepNote: string;
  dropItemNote: string;
  orgBItemNote: string;
  keepSaleNote: string;
  dropSaleNote: string;
  orgBSaleNote: string;
  orgAClientEmail: string;
  orgBClientEmail: string;
  searchToken: string;
};

export function createExportFixtureMarkers(
  runId: string
): ExportFixtureMarkers {
  const token = exportRunToken(runId);
  return {
    token,
    keepSerial: `=${token}KEEP`,
    dropSerial: `${token}DROP`,
    orgBSerial: `${token}ORGB`,
    keepMaker: `+Keep, "M" ${token}`,
    dropMaker: `DropPlain ${token}`,
    orgBMaker: `OrgB ${token}`,
    keepType: '-Violin',
    certificateName: '@Cert "A", 바이올린',
    keepNote: 'line1\n"quoted", 바이올린',
    dropItemNote: `DROP_ITEM_${token}`,
    orgBItemNote: `ORGB_ITEM_${token}`,
    keepSaleNote: `KEEP_SALE_${token}, "바이올린"`,
    dropSaleNote: `DROP_SALE_${token}`,
    orgBSaleNote: `ORGB_SALE_${token}`,
    orgAClientEmail: `export-e2e-${runId}-a@example.test`,
    orgBClientEmail: `export-e2e-${runId}-b@example.test`,
    searchToken: `${token}KEEP`,
  };
}
