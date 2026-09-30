import type { HostedActor } from '../auth-matrix/hosted-session';
import { buildHostedRequestHeaders } from '../auth-matrix/hosted-session';
import {
  EXPORT_E2E_DROP_SALE_PRICE,
  EXPORT_E2E_KEEP_SALE_PRICE,
  EXPORT_E2E_ORG_B_SALE_PRICE,
  type ExportCaseResult,
  type ExportFixtureMarkers,
} from './constants';

type SalesExportBody = {
  success?: boolean;
  scope?: string;
  truncated?: boolean;
  error_code?: string;
  message?: string;
  data?: Array<{
    id?: string;
    notes?: string | null;
    sale_price?: number;
  }>;
  pagination?: {
    page?: number;
    pageSize?: number;
    totalCount?: number;
    totalPages?: number;
  };
};

export async function runSalesApiCases(options: {
  appBaseUrl: string;
  orgAAdmin: HostedActor;
  orgAMember: HostedActor;
  orgBAdmin: HostedActor;
  markers: ExportFixtureMarkers;
  keepSaleId: string;
  dropSaleId: string;
  orgBSaleId: string;
  fetchImpl?: typeof fetch;
}): Promise<ExportCaseResult[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const admin = await requestSales(
    fetchImpl,
    options.appBaseUrl,
    options.orgAAdmin,
    {
      export: 'true',
      page: '1',
      pageSize: '6000',
    }
  );
  const member = await requestSales(
    fetchImpl,
    options.appBaseUrl,
    options.orgAMember,
    {
      export: 'true',
      pageSize: '5000',
    }
  );
  const invalid = await requestSales(
    fetchImpl,
    options.appBaseUrl,
    options.orgAAdmin,
    {
      hasClient: 'maybe',
    }
  );
  const orgB = await requestSales(
    fetchImpl,
    options.appBaseUrl,
    options.orgBAdmin,
    {
      export: 'true',
      page: '1',
      pageSize: '5000',
    }
  );

  return [
    assertAdminExport(admin, options),
    assertMemberForbidden(member, options.markers),
    assertInvalidFilter(invalid, options.markers),
    assertIsolation('isolation-org-a-api', admin, options, 'A'),
    assertIsolation('isolation-org-b-api', orgB, options, 'B'),
  ];
}

async function requestSales(
  fetchImpl: typeof fetch,
  appBaseUrl: string,
  actor: HostedActor,
  params: Record<string, string>
): Promise<{
  status: number;
  contentType: string;
  disposition: string;
  body: SalesExportBody;
  raw: string;
}> {
  const url = new URL('/api/sales', appBaseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetchImpl(url, {
    headers: buildHostedRequestHeaders(actor),
  });
  const raw = await response.text();
  let body: SalesExportBody = {};
  try {
    body = JSON.parse(raw) as SalesExportBody;
  } catch {
    body = {};
  }
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    disposition: response.headers.get('content-disposition') ?? '',
    body,
    raw,
  };
}

function assertAdminExport(
  response: Awaited<ReturnType<typeof requestSales>>,
  options: {
    markers: ExportFixtureMarkers;
    keepSaleId: string;
    dropSaleId: string;
  }
): ExportCaseResult {
  const id = 'sales-admin-api';
  try {
    if (response.status !== 200) {
      throw new Error(`expected HTTP 200, received ${response.status}`);
    }
    if (!response.contentType.toLowerCase().includes('json')) {
      throw new Error('export response was not JSON');
    }
    if (/attachment/i.test(response.disposition)) {
      throw new Error('server returned a CSV attachment');
    }
    if (response.body.success !== true || response.body.scope !== 'all') {
      throw new Error(
        `expected success and scope=all, received success=${String(response.body.success)} scope=${String(response.body.scope)}`
      );
    }
    if (response.body.pagination?.pageSize !== 5000) {
      throw new Error(
        `expected capped pageSize 5000, received ${String(response.body.pagination?.pageSize)}`
      );
    }
    if (response.body.pagination?.totalCount !== 2) {
      throw new Error(
        `expected 2 org A sales, received totalCount ${String(response.body.pagination?.totalCount)}`
      );
    }
    const rows = response.body.data ?? [];
    if (rows.length !== 2 || response.body.pagination?.totalPages !== 1) {
      throw new Error(
        'export pagination was not coherent with the synthetic sales'
      );
    }
    const keep = rows.find(row => row.id === options.keepSaleId);
    const drop = rows.find(row => row.id === options.dropSaleId);
    if (!keep || !drop) {
      throw new Error('export data did not contain both synthetic org A sales');
    }
    if (keep.sale_price !== EXPORT_E2E_KEEP_SALE_PRICE) {
      throw new Error('admin export did not include the kept sale_price');
    }
    if (drop.sale_price !== EXPORT_E2E_DROP_SALE_PRICE) {
      throw new Error(
        'admin export did not include the other org A sale_price'
      );
    }
    return {
      id,
      ok: true,
      detail:
        'HTTP 200 JSON scope=all pageSize capped at 5000; sale_price present; rate-limit bucket not exhausted',
    };
  } catch (error) {
    return { id, ok: false, detail: message(error) };
  }
}

function assertMemberForbidden(
  response: Awaited<ReturnType<typeof requestSales>>,
  markers: ExportFixtureMarkers
): ExportCaseResult {
  const id = 'sales-member-api';
  try {
    if (
      response.status !== 403 ||
      response.body.error_code !== 'ADMIN_REQUIRED'
    ) {
      throw new Error(
        `expected 403 ADMIN_REQUIRED, received ${response.status} ${response.body.error_code ?? 'no-code'}`
      );
    }
    if (Array.isArray(response.body.data) && response.body.data.length > 0) {
      throw new Error('member export returned sales data');
    }
    if (
      response.raw.includes(markers.keepSaleNote) ||
      response.raw.includes(markers.orgBSaleNote) ||
      response.raw.includes(String(EXPORT_E2E_KEEP_SALE_PRICE))
    ) {
      throw new Error('member export body contained sales data');
    }
    return {
      id,
      ok: true,
      detail: 'HTTP 403 error_code=ADMIN_REQUIRED; no sales data',
    };
  } catch (error) {
    return { id, ok: false, detail: message(error) };
  }
}

function assertInvalidFilter(
  response: Awaited<ReturnType<typeof requestSales>>,
  markers: ExportFixtureMarkers
): ExportCaseResult {
  const id = 'sales-invalid-filter';
  try {
    if (response.status !== 400) {
      throw new Error(`expected HTTP 400, received ${response.status}`);
    }
    const text = `${response.body.message ?? ''} ${response.raw}`;
    if (!text.includes('hasClient')) {
      throw new Error('invalid hasClient filter was not rejected');
    }
    if (response.raw.includes(markers.keepSaleNote)) {
      throw new Error('invalid filter response contained sales data');
    }
    return {
      id,
      ok: true,
      detail: 'HTTP 400 for hasClient=maybe; export rate-limit bucket not used',
    };
  } catch (error) {
    return { id, ok: false, detail: message(error) };
  }
}

function assertIsolation(
  id: 'isolation-org-a-api' | 'isolation-org-b-api',
  response: Awaited<ReturnType<typeof requestSales>>,
  options: {
    markers: ExportFixtureMarkers;
    keepSaleId: string;
    dropSaleId: string;
    orgBSaleId: string;
  },
  org: 'A' | 'B'
): ExportCaseResult {
  try {
    if (response.status !== 200 || response.body.success !== true) {
      throw new Error(`isolation request failed with HTTP ${response.status}`);
    }
    const rows = response.body.data ?? [];
    const ids = new Set(rows.map(row => row.id));
    if (org === 'A') {
      if (!ids.has(options.keepSaleId) || !ids.has(options.dropSaleId)) {
        throw new Error('Org A export missed its own sales');
      }
      if (
        ids.has(options.orgBSaleId) ||
        response.raw.includes(options.markers.orgBSaleNote)
      ) {
        throw new Error('Org A export returned Org B sales');
      }
      return {
        id,
        ok: true,
        detail: 'Org A export did not return Org B sales',
      };
    }
    if (!ids.has(options.orgBSaleId)) {
      throw new Error('Org B export missed its own sale');
    }
    if (
      ids.has(options.keepSaleId) ||
      ids.has(options.dropSaleId) ||
      response.raw.includes(options.markers.keepSaleNote)
    ) {
      throw new Error('Org B export returned Org A sales');
    }
    const orgBRow = rows.find(row => row.id === options.orgBSaleId);
    if (orgBRow?.sale_price !== EXPORT_E2E_ORG_B_SALE_PRICE) {
      throw new Error('Org B admin export did not include its sale_price');
    }
    return { id, ok: true, detail: 'Org B export did not return Org A sales' };
  } catch (error) {
    return { id, ok: false, detail: message(error) };
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Sales API case failed.';
}
