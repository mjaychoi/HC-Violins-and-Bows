/** @jest-environment node */

import React from 'react';
import { NextRequest } from 'next/server';
import { errorHandler } from '@/utils/errorHandler';
import {
  INVOICE_PDF_INSTRUMENT_COLUMNS,
  INVOICE_PDF_SELECT,
} from '../invoicePdfQuery';

let mockUserSupabase: {
  from: jest.Mock;
};
let mockAuthContext: {
  user: { id: string };
  accessToken: string;
  orgId: string | null;
  clientId: string;
  role: 'admin' | 'member';
  userSupabase: unknown;
  isTestBypass: boolean;
};

const mockRenderToBufferFn = jest
  .fn()
  .mockResolvedValue(Buffer.from('%PDF-1.4 fake pdf content'));
const mockInvoiceDoc = jest.fn(() => React.createElement('div'));
const mockAttachSignedUrlsToInvoiceItems = jest.fn(
  async (_supabase: unknown, items: Array<Record<string, unknown>>) =>
    (items ?? []).map(item => ({
      ...item,
      image_signed_url: item.image_url
        ? 'https://signed.example/invoice-item.png'
        : null,
    }))
);

jest.mock('next/server', () => {
  const actual = jest.requireActual(
    'next/server'
  ) as typeof import('next/server');

  class TestNextResponse extends Response {
    static json = actual.NextResponse.json.bind(actual.NextResponse);
    static redirect = actual.NextResponse.redirect.bind(actual.NextResponse);
    static rewrite = actual.NextResponse.rewrite.bind(actual.NextResponse);
    static next = actual.NextResponse.next.bind(actual.NextResponse);
  }

  return {
    ...actual,
    NextResponse: TestNextResponse,
  };
});

jest.mock('@react-pdf/renderer', () => ({
  __esModule: true,
  renderToBuffer: jest.fn((document: unknown) =>
    mockRenderToBufferFn(document)
  ),
}));

jest.mock('@/components/invoices/InvoiceDocument', () => ({
  __esModule: true,
  default: mockInvoiceDoc,
}));

jest.mock('@/utils/errorHandler');
jest.mock('@/utils/logger', () => ({
  logApiRequest: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
  logInfo: jest.fn(),
}));
jest.mock('@/utils/monitoring', () => ({
  captureException: jest.fn(),
}));
jest.mock('@/app/api/_utils/rateLimit', () => ({
  searchRateLimit: null,
  exportRateLimit: null,
  authRateLimit: null,
  mutationRateLimit: null,
  uploadRateLimit: null,
  destructiveMutationRateLimit: null,
  applyRateLimit: jest.fn().mockResolvedValue({ limited: false }),
  applyScopedRateLimit: jest.fn().mockResolvedValue({ limited: false }),
  extractClientIp: jest.fn(),
  RATE_LIMIT_ROUTE_KEYS: {
    invoicesPdf: 'invoices:pdf',
  },
  tooManyRequestsApiResult: () => ({
    payload: { error: 'Too many requests', success: false },
    status: 429,
  }),
}));
jest.mock('@/app/api/invoices/imageUrls', () => ({
  attachSignedUrlsToInvoiceItems: (
    supabase: unknown,
    items: Array<Record<string, unknown>>
  ) => mockAttachSignedUrlsToInvoiceItems(supabase, items),
}));
jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute:
      (handler: (request: unknown, auth: unknown) => unknown) =>
      async (request: unknown) =>
        handler(request, {
          ...mockAuthContext,
          userSupabase: mockUserSupabase,
        }),
  };
});

const mockErrorHandler = errorHandler as jest.Mocked<typeof errorHandler>;

const INVOICE_ID = '123e4567-e89b-12d3-a456-426614174000';
const CLIENT_ID = '123e4567-e89b-12d3-a456-426614174001';
const INSTRUMENT_ID = '123e4567-e89b-12d3-a456-426614174002';
const ITEM_ID = '123e4567-e89b-12d3-a456-426614174010';
const ORG_ID = 'test-org';

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE_ID,
    invoice_number: 'INV-100',
    invoice_date: '2026-04-03',
    due_date: '2026-04-10',
    subtotal: 3000,
    tax: 0,
    total: 3000,
    currency: 'USD',
    status: 'draft',
    notes: null,
    clients: {
      id: CLIENT_ID,
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      contact_number: '010-1234-5678',
      address: 'Seoul',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    invoice_items: [
      {
        id: ITEM_ID,
        invoice_id: INVOICE_ID,
        instrument_id: INSTRUMENT_ID,
        description: 'Violin',
        qty: 1,
        rate: 3000,
        amount: 3000,
        image_url: null,
        display_order: 0,
        created_at: '2026-04-03T00:00:00.000Z',
        instrument: { serial_number: 'SN12345' },
      },
    ],
    ...overrides,
  };
}

function mockInvoiceQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    data: result.data,
    error: result.error,
  };
  mockUserSupabase = {
    from: jest.fn().mockReturnValue(query),
  };
  return query;
}

async function loadPdfHandler() {
  const pdfModule = await import('../route');
  return pdfModule.GET;
}

describe('GET /api/invoices/:id/pdf instrument ACL', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(performance, 'now').mockReturnValue(0);
    mockUserSupabase = { from: jest.fn() };
    mockAuthContext = {
      user: { id: 'test-user' },
      accessToken: 'test-token',
      orgId: ORG_ID,
      clientId: 'test-client',
      role: 'admin',
      userSupabase: mockUserSupabase,
      isTestBypass: true,
    };
    mockRenderToBufferFn.mockResolvedValue(
      Buffer.from('%PDF-1.4 fake pdf content')
    );
    mockErrorHandler.createError = jest
      .fn()
      .mockImplementation(
        (code: string, message: string, details?: string) => ({
          code,
          message: details || message,
          status: 500,
        })
      );
    mockErrorHandler.handleSupabaseError = jest
      .fn()
      .mockImplementation((error: unknown) => {
        const err = (error ?? {}) as { message?: string; code?: string };
        return {
          code: err.code === 'PGRST116' ? 'RECORD_NOT_FOUND' : 'DATABASE_ERROR',
          message: err.message || 'Supabase error',
          status: err.code === 'PGRST116' ? 404 : 500,
        };
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('selects only serial_number from the instrument embed', () => {
    expect(INVOICE_PDF_INSTRUMENT_COLUMNS).toEqual(['serial_number']);
    expect(INVOICE_PDF_SELECT).toMatch(
      /instrument:instruments\s*\(\s*serial_number\s*\)/
    );
    expect(INVOICE_PDF_SELECT).not.toMatch(/instruments\s*\(\s*\*\s*\)/);
    expect(INVOICE_PDF_SELECT).not.toMatch(/cost_price/);
    expect(INVOICE_PDF_SELECT).not.toMatch(/consignment_price/);
    expect(INVOICE_PDF_SELECT).not.toMatch(/sale_price/);
  });

  it('admin PDF generation succeeds without requesting restricted instrument columns', async () => {
    const query = mockInvoiceQuery({ data: invoiceRow(), error: null });
    const GET = await loadPdfHandler();
    const response = await GET(
      new NextRequest(`http://localhost/api/invoices/${INVOICE_ID}/pdf`),
      { params: Promise.resolve({ id: INVOICE_ID }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(mockUserSupabase.from).toHaveBeenCalledWith('invoices');
    expect(query.select).toHaveBeenCalledWith(INVOICE_PDF_SELECT);
    expect(query.eq).toHaveBeenCalledWith('id', INVOICE_ID);
    expect(query.eq).toHaveBeenCalledWith('org_id', ORG_ID);

    const selectSql = String(query.select.mock.calls[0][0]);
    expect(selectSql).not.toMatch(/instruments\s*\(\s*\*\s*\)/);
    expect(selectSql).not.toContain('cost_price');
    expect(selectSql).not.toContain('consignment_price');

    const element = mockRenderToBufferFn.mock.calls[0][0] as {
      props: { invoice: { itemNumber?: string } };
    };
    expect(element.props.invoice.itemNumber).toBe('SN12345');
  });

  it('preserves signed invoice-item image URLs in the PDF payload', async () => {
    mockInvoiceQuery({
      data: invoiceRow({
        invoice_items: [
          {
            id: ITEM_ID,
            invoice_id: INVOICE_ID,
            instrument_id: INSTRUMENT_ID,
            description: 'Violin',
            qty: 1,
            rate: 3000,
            amount: 3000,
            image_url: `${ORG_ID}/item.png`,
            display_order: 0,
            created_at: '2026-04-03T00:00:00.000Z',
            instrument: { serial_number: 'SN12345' },
          },
        ],
      }),
      error: null,
    });

    const GET = await loadPdfHandler();
    const response = await GET(
      new NextRequest(`http://localhost/api/invoices/${INVOICE_ID}/pdf`),
      { params: Promise.resolve({ id: INVOICE_ID }) }
    );

    expect(response.status).toBe(200);
    expect(mockAttachSignedUrlsToInvoiceItems).toHaveBeenCalled();
    const element = mockRenderToBufferFn.mock.calls[0][0] as {
      props: { items: Array<{ image_url?: string }> };
    };
    expect(element.props.items[0].image_url).toBe(
      'https://signed.example/invoice-item.png'
    );
  });

  it('denies member PDF access before querying', async () => {
    mockAuthContext.role = 'member';
    const GET = await loadPdfHandler();
    const response = await GET(
      new NextRequest(`http://localhost/api/invoices/${INVOICE_ID}/pdf`),
      { params: Promise.resolve({ id: INVOICE_ID }) }
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error_code).toBe('ADMIN_ROLE_REQUIRED');
    expect(mockUserSupabase.from).not.toHaveBeenCalled();
  });

  it('denies cross-org invoice PDF access', async () => {
    const query = mockInvoiceQuery({
      data: null,
      error: {
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or no) rows returned',
      },
    });
    const GET = await loadPdfHandler();
    const response = await GET(
      new NextRequest(`http://localhost/api/invoices/${INVOICE_ID}/pdf`),
      { params: Promise.resolve({ id: INVOICE_ID }) }
    );

    expect(response.status).toBe(404);
    expect(query.eq).toHaveBeenCalledWith('org_id', ORG_ID);
    expect(response.headers.get('Content-Type')).not.toBe('application/pdf');
  });
});
