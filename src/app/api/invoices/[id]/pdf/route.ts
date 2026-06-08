import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import type { DocumentProps } from '@react-pdf/renderer';
import fs from 'fs/promises';
import path from 'path';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import {
  requireAdmin,
  requireOrgContext,
} from '@/app/api/_utils/withAuthRoute';

import { errorHandler } from '@/utils/errorHandler';
import { logApiRequest, logWarn } from '@/utils/logger';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity, ErrorCodes } from '@/types/errors';
import {
  createSafeErrorResponse,
  createLogErrorInfo,
} from '@/utils/errorSanitization';
import { validateUUID } from '@/utils/inputValidation';

import type { InvoiceDocumentProps } from '@/components/invoices/InvoiceDocument';
import {
  normalizeSupabaseClientJoin,
  normalizeSupabaseInvoiceItemsJoin,
} from '@/utils/invoiceNormalize';
import { attachSignedUrlsToInvoiceItems } from '../../imageUrls';
import { createApiErrorResponse } from '@/app/api/_utils/apiErrors';
import {
  getOrCreateRequestId,
  withRequestIdHeader,
} from '@/app/api/_utils/requestContext';
import { todayLocalYMD } from '@/utils/dateParsing';
import { exportRateLimit, applyRateLimit } from '@/app/api/_utils/rateLimit';

export const runtime = 'nodejs';

const MAX_PDF_SIZE = 20 * 1024 * 1024;
const PDF_GENERATION_TIMEOUT_MS = 15_000;

const nowMs = () =>
  typeof globalThis.performance !== 'undefined'
    ? globalThis.performance.now()
    : Date.now();

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function isSupabaseLikeError(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === 'object' &&
    (((error as { code?: string }).code ?? '').startsWith('PGRST') ||
      (error as { name?: string }).name === 'PostgrestError')
  );
}

function getPostgrestStatus(error: unknown): number {
  if (
    error &&
    typeof error === 'object' &&
    (error as { code?: string }).code === 'PGRST116'
  ) {
    return 404;
  }

  return 500;
}

let reactPdfLoader: Promise<{
  renderToBuffer: typeof import('@react-pdf/renderer').renderToBuffer;
  InvoiceDocument: React.ComponentType<InvoiceDocumentProps>;
}> | null = null;

async function loadReactPDF() {
  const isDev = process.env.NODE_ENV === 'development';

  if (!reactPdfLoader || isDev) {
    reactPdfLoader = (async () => {
      if (
        typeof global !== 'undefined' &&
        !(global as Record<string, unknown>).React
      ) {
        (global as Record<string, unknown>).React = React;
      }

      const reactPdf = await import('@react-pdf/renderer');
      const InvoiceDocument = (
        await import('@/components/invoices/InvoiceDocument')
      ).default;

      return {
        renderToBuffer: reactPdf.renderToBuffer,
        InvoiceDocument,
      };
    })();

    if (isDev) {
      setTimeout(() => {
        reactPdfLoader = null;
      }, 100);
    }
  }

  return reactPdfLoader;
}

function sanitizeFilename(input: string): string {
  const safe = String(input)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .trim()
    .substring(0, 200);

  return safe || 'invoice';
}

function createContentDisposition(filename: string, inline: boolean): string {
  const safeFilename = sanitizeFilename(filename);
  const baseFilename = `${safeFilename}.pdf`;
  const encoded = encodeURIComponent(baseFilename);
  const disposition = inline ? 'inline' : 'attachment';

  return `${disposition}; filename="${baseFilename}"; filename*=UTF-8''${encoded}`;
}

const STORE_INFO = {
  name: 'HC Violins',
  addressLines: [
    '202, 67 Banpodaero, Seocho-gu, Seoul,',
    'Republic of Korea 06670',
  ],
  phone: process.env.NEXT_PUBLIC_STORE_PHONE || '02-0000-0000',
  email: process.env.NEXT_PUBLIC_STORE_EMAIL || 'contact@hcviolins.com',
};

const BANKING_INFO = {
  accountHolder: process.env.NEXT_PUBLIC_BANK_ACCOUNT_HOLDER || '',
  bankName: process.env.NEXT_PUBLIC_BANK_NAME || '',
  swiftCode: process.env.NEXT_PUBLIC_BANK_SWIFT || '',
  accountNumber: process.env.NEXT_PUBLIC_BANK_ACCOUNT || '',
};

async function resolveLogoSrc(): Promise<string | null> {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo.png');
    const logoBuf = await fs.readFile(logoPath);

    return `data:image/png;base64,${logoBuf.toString('base64')}`;
  } catch (error) {
    const absoluteUrl =
      process.env.NEXT_PUBLIC_LOGO_URL || 'https://www.hcviolins.com/logo.png';

    logWarn(
      'Failed to read logo from public folder, will try absolute URL:',
      error instanceof Error ? error.message : String(error)
    );

    return absoluteUrl || null;
  }
}

type NormalizedInvoice = {
  invoice_date?: string | null;
  due_date?: string | null;
  invoice_number?: string | null;
  currency?: string | null;
  status?: string | null;
  notes?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  total?: number | null;
  business_name?: string | null;
  business_address?: string | null;
  business_phone?: string | null;
  business_email?: string | null;
  bank_account_holder?: string | null;
  bank_name?: string | null;
  bank_swift_code?: string | null;
  bank_account_number?: string | null;
  default_conditions?: string | null;
  default_exchange_rate?: string | null;
  client: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    contact_number?: string | null;
    address?: string | null;
  } | null;
  items: {
    description: string;
    qty: number;
    rate: number;
    amount: number;
    image_url: string | null;
    item_number?: string | null;
  }[];
};

function readStringField(
  record: Record<string, unknown>,
  key: string
): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function readNumberField(
  record: Record<string, unknown>,
  key: string
): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeInvoiceRecord(invoice: unknown): NormalizedInvoice {
  const invoiceRecord = invoice as Record<string, unknown>;

  return {
    invoice_date: readStringField(invoiceRecord, 'invoice_date'),
    due_date: readStringField(invoiceRecord, 'due_date'),
    invoice_number: readStringField(invoiceRecord, 'invoice_number'),
    currency: readStringField(invoiceRecord, 'currency'),
    status: readStringField(invoiceRecord, 'status'),
    notes: readStringField(invoiceRecord, 'notes'),
    subtotal: readNumberField(invoiceRecord, 'subtotal'),
    tax: readNumberField(invoiceRecord, 'tax'),
    total: readNumberField(invoiceRecord, 'total'),

    business_name: readStringField(invoiceRecord, 'business_name'),
    business_address: readStringField(invoiceRecord, 'business_address'),
    business_phone: readStringField(invoiceRecord, 'business_phone'),
    business_email: readStringField(invoiceRecord, 'business_email'),

    bank_account_holder: readStringField(invoiceRecord, 'bank_account_holder'),
    bank_name: readStringField(invoiceRecord, 'bank_name'),
    bank_swift_code: readStringField(invoiceRecord, 'bank_swift_code'),
    bank_account_number: readStringField(invoiceRecord, 'bank_account_number'),

    default_conditions: readStringField(invoiceRecord, 'default_conditions'),
    default_exchange_rate: readStringField(
      invoiceRecord,
      'default_exchange_rate'
    ),

    client: null,
    items: [],
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const handler = withSentryRoute(
    withAuthRoute(async (req, auth) => {
      return generateInvoicePdfResponse(req, auth, id);
    })
  );

  return handler(request);
}

async function generateInvoicePdfResponse(
  req: NextRequest,
  auth: AuthContext,
  id: string
): Promise<Response> {
  const startTime = nowMs();
  const requestId = getOrCreateRequestId(req);
  const routePath = `/api/invoices/${id}/pdf`;

  try {
    const { limited } = await applyRateLimit(exportRateLimit, auth.user.id);
    if (limited) {
      const duration = Math.round(nowMs() - startTime);
      logApiRequest('GET', routePath, 429, duration, 'InvoicesAPI', {
        invoiceId: id,
        requestId,
        error: true,
        errorCode: 'RATE_LIMIT_EXCEEDED',
      });
      return withRequestIdHeader(
        createApiErrorResponse(
          {
            message: 'Too many requests',
            error_code: 'RATE_LIMIT_EXCEEDED',
            retryable: true,
          },
          429
        ),
        requestId
      );
    }

    const inline = new URL(req.url).searchParams.get('inline') === 'true';

    const orgContextError = requireOrgContext(auth);
    if (orgContextError) {
      const duration = Math.round(nowMs() - startTime);

      logApiRequest('GET', routePath, 403, duration, 'InvoicesAPI', {
        invoiceId: id,
        requestId,
        error: true,
        errorCode: 'ORG_CONTEXT_REQUIRED',
      });

      return withRequestIdHeader(
        createApiErrorResponse(
          {
            message: 'Organization context required',
            error_code: 'ORG_CONTEXT_REQUIRED',
            retryable: false,
          },
          403
        ),
        requestId
      );
    }

    const adminError = requireAdmin(auth);
    if (adminError) {
      const duration = Math.round(nowMs() - startTime);

      logApiRequest('GET', routePath, 403, duration, 'InvoicesAPI', {
        invoiceId: id,
        requestId,
        error: true,
        errorCode: 'ADMIN_ROLE_REQUIRED',
      });

      return withRequestIdHeader(
        createApiErrorResponse(
          {
            message: 'Admin role required',
            error_code: 'ADMIN_ROLE_REQUIRED',
            retryable: false,
          },
          403
        ),
        requestId
      );
    }

    if (!validateUUID(id)) {
      const duration = Math.round(nowMs() - startTime);

      logApiRequest('GET', routePath, 400, duration, 'InvoicesAPI', {
        invoiceId: id,
        requestId,
        error: true,
        errorCode: 'INVALID_UUID',
      });

      return withRequestIdHeader(
        createApiErrorResponse(
          {
            message: 'Invalid invoice ID format',
            error_code: 'INVALID_UUID',
            retryable: false,
          },
          400
        ),
        requestId
      );
    }

    const orgId = auth.orgId!;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = auth.userSupabase
      .from('invoices')
      .select(
        `
          *,
          clients (*),
          invoice_items (
            *,
            instruments (*)
          )
        `
      )
      .eq('id', id);

    query = query.eq('org_id', orgId);

    const { data: invoice, error: invoiceError } = await query.single();

    if (invoiceError || !invoice) {
      const duration = Math.round(nowMs() - startTime);
      const appError = errorHandler.handleSupabaseError(
        invoiceError || new Error('Invoice not found'),
        'Fetch invoice for PDF'
      );
      const logInfo = createLogErrorInfo(appError);
      const status = getPostgrestStatus(invoiceError);

      logApiRequest('GET', routePath, status, duration, 'InvoicesAPI', {
        invoiceId: id,
        requestId,
        error: true,
        errorCode: (appError as { code?: string })?.code,
        logMessage: logInfo.message,
      });

      captureException(
        appError,
        'InvoicesAPI.GET',
        { invoiceId: id, duration, requestId },
        ErrorSeverity.MEDIUM
      );

      return withRequestIdHeader(
        NextResponse.json(createSafeErrorResponse(appError, status), {
          status,
        }),
        requestId
      );
    }

    const invoiceRecord = invoice as Record<string, unknown>;
    const normalizedInvoice = normalizeInvoiceRecord(invoiceRecord);

    const { client: normalizedClient } = normalizeSupabaseClientJoin(
      invoiceRecord.clients ?? invoiceRecord.client
    );

    normalizedInvoice.client = normalizedClient
      ? {
          first_name: normalizedClient.first_name ?? null,
          last_name: normalizedClient.last_name ?? null,
          email: normalizedClient.email ?? null,
          contact_number: normalizedClient.contact_number ?? null,
          address: normalizedClient.address ?? null,
        }
      : null;

    const normalizedItems = normalizeSupabaseInvoiceItemsJoin(
      invoiceRecord.invoice_items ?? invoiceRecord.items
    );

    const hydratedItems = await attachSignedUrlsToInvoiceItems(
      auth.userSupabase,
      normalizedItems.map(item => ({
        ...item,
        image_signed_url: null,
      }))
    );

    normalizedInvoice.items = (hydratedItems ?? []).map(item => ({
      description: item.description,
      qty: item.qty,
      rate: item.rate,
      amount: item.amount,
      image_url: item.image_signed_url || item.image_url,
      item_number: item.instrument?.serial_number || null,
    }));

    const logoSrc = await resolveLogoSrc();

    const invoiceDate = normalizedInvoice.invoice_date ?? todayLocalYMD();
    const formattedDate = invoiceDate.replace(/-/g, '.');

    const items = normalizedInvoice.items.map(item => ({
      description: item.description,
      qty: item.qty,
      rate: item.rate,
      amount: item.amount,
      image_url: item.image_url || undefined,
    }));

    const pdfClient = normalizedInvoice.client;

    const clientName = pdfClient
      ? (() => {
          const fullName =
            `${pdfClient.first_name || ''} ${pdfClient.last_name || ''}`.trim();

          if (fullName) return fullName;
          if (pdfClient.email) return pdfClient.email;

          return 'Customer';
        })()
      : 'Customer';

    const companyName = normalizedInvoice.business_name || STORE_INFO.name;

    const companyAddress = normalizedInvoice.business_address
      ? normalizedInvoice.business_address.split('\n').filter(Boolean)
      : STORE_INFO.addressLines;

    const companyPhone = normalizedInvoice.business_phone || STORE_INFO.phone;
    const companyEmail = normalizedInvoice.business_email || STORE_INFO.email;

    const bankingAccountHolder =
      normalizedInvoice.bank_account_holder || BANKING_INFO.accountHolder;
    const bankingBankName =
      normalizedInvoice.bank_name || BANKING_INFO.bankName;
    const bankingSwiftCode =
      normalizedInvoice.bank_swift_code || BANKING_INFO.swiftCode;
    const bankingAccountNumber =
      normalizedInvoice.bank_account_number || BANKING_INFO.accountNumber;

    const itemWithNumber = normalizedInvoice.items.find(
      item => item.item_number && item.item_number.trim()
    );
    const itemNumber = itemWithNumber?.item_number || undefined;

    const conditions =
      normalizedInvoice.default_conditions ||
      normalizedInvoice.notes ||
      undefined;

    const { renderToBuffer: renderToBufferFn, InvoiceDocument: InvoiceDoc } =
      await loadReactPDF();

    const pdfBuffer = await withTimeout(
      renderToBufferFn(
        React.createElement(InvoiceDoc, {
          logoSrc: logoSrc || undefined,
          company: {
            name: companyName,
            addressLines: companyAddress,
            phone: companyPhone,
            email: companyEmail,
          },
          billTo: {
            name: clientName,
            addressLines: pdfClient?.address ? [pdfClient.address] : undefined,
            phone: pdfClient?.contact_number || undefined,
          },
          shipTo: undefined,
          invoice: {
            invoiceNumber: normalizedInvoice.invoice_number || id,
            itemNumber,
            date: formattedDate,
            dueDate: normalizedInvoice.due_date
              ? normalizedInvoice.due_date.replace(/-/g, '.')
              : undefined,
            currency: normalizedInvoice.currency || 'USD',
            status: normalizedInvoice.status || undefined,
            exchangeRate: normalizedInvoice.default_exchange_rate || undefined,
            note: normalizedInvoice.notes || undefined,
          },
          items,
          banking: {
            accountHolder: bankingAccountHolder || undefined,
            bankName: bankingBankName || undefined,
            swiftCode: bankingSwiftCode || undefined,
            accountNumber: bankingAccountNumber || undefined,
          },
          totals: {
            subtotal: normalizedInvoice.subtotal ?? 0,
            tax: normalizedInvoice.tax ?? undefined,
            total: normalizedInvoice.total ?? 0,
          },
          conditions,
        }) as React.ReactElement<DocumentProps>
      ),
      PDF_GENERATION_TIMEOUT_MS,
      `Invoice PDF generation exceeded ${PDF_GENERATION_TIMEOUT_MS}ms`
    );

    if (pdfBuffer.length > MAX_PDF_SIZE) {
      const appError = errorHandler.createError(
        ErrorCodes.FILE_TOO_LARGE,
        'PDF file too large',
        `Generated PDF exceeds maximum size of ${MAX_PDF_SIZE / 1024 / 1024}MB`
      );
      const duration = Math.round(nowMs() - startTime);
      const logInfo = createLogErrorInfo(appError);

      logApiRequest('GET', routePath, 413, duration, 'InvoicesAPI', {
        invoiceId: id,
        requestId,
        error: true,
        logMessage: logInfo.message,
        pdfSize: pdfBuffer.length,
      });

      captureException(
        appError,
        'InvoicesAPI.GET',
        { invoiceId: id, pdfSize: pdfBuffer.length, duration, requestId },
        ErrorSeverity.HIGH
      );

      return withRequestIdHeader(
        NextResponse.json(createSafeErrorResponse(appError, 413), {
          status: 413,
        }),
        requestId
      );
    }

    const duration = Math.round(nowMs() - startTime);
    const filename = `invoice-${normalizedInvoice.invoice_number || id}`;

    logApiRequest('GET', routePath, 200, duration, 'InvoicesAPI', {
      invoiceId: id,
      invoiceNumber: normalizedInvoice.invoice_number || undefined,
      pdfSize: pdfBuffer.length,
      requestId,
    });

    return withRequestIdHeader(
      new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': createContentDisposition(filename, inline),
          'Content-Length': pdfBuffer.length.toString(),
          'Cache-Control': 'private, no-store',
        },
      }),
      requestId
    );
  } catch (error) {
    const duration = Math.round(nowMs() - startTime);

    const appError = errorHandler.handleSupabaseError(
      isSupabaseLikeError(error)
        ? error
        : errorHandler.createError(
            ErrorCodes.UNKNOWN_ERROR,
            'Invoice PDF generation failed',
            error instanceof Error
              ? error.message
              : 'Failed to generate invoice PDF',
            {
              invoiceId: id,
              errorType: error instanceof Error ? error.name : typeof error,
            }
          ),
      'Generate invoice PDF'
    );

    const logInfo = createLogErrorInfo(appError);

    logApiRequest('GET', routePath, 500, duration, 'InvoicesAPI', {
      invoiceId: id,
      requestId,
      error: true,
      errorCode: (appError as { code?: string })?.code,
      logMessage: logInfo.message,
    });

    captureException(
      appError,
      'InvoicesAPI.GET',
      { invoiceId: id, duration, requestId },
      ErrorSeverity.HIGH
    );

    return withRequestIdHeader(
      NextResponse.json(createSafeErrorResponse(appError, 500), {
        status: 500,
      }),
      requestId
    );
  }
}
