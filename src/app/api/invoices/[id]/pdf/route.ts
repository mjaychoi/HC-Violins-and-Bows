import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import type { DocumentProps } from '@react-pdf/renderer';
import fs from 'fs/promises';
import path from 'path';
import type { User } from '@supabase/supabase-js';

import { getServerSupabase } from '@/lib/supabase-server';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';

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

// FIXED: Ensure Node.js runtime for PDF generation (Edge runtime breaks react-pdf)
export const runtime = 'nodejs';

// FIXED: Promise cache to prevent race conditions on concurrent requests
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

const MAX_PDF_SIZE = 20 * 1024 * 1024;

function sanitizeFilename(input: string): string {
  const safe = String(input)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .trim()
    .substring(0, 200);

  return safe || 'invoice';
}

function createContentDisposition(filename: string, inline: boolean): string {
  const safeFilename = sanitizeFilename(filename);
  // filename already includes "invoice-" prefix, so don't add it again
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

function getOrgScopeFromUser(user: User | undefined): { orgId?: string } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyUser = user as any;
  const orgId =
    anyUser?.org_id ??
    anyUser?.organization_id ??
    anyUser?.orgId ??
    anyUser?.organizationId ??
    anyUser?.user_metadata?.org_id ??
    anyUser?.user_metadata?.organization_id ??
    anyUser?.app_metadata?.org_id ??
    anyUser?.app_metadata?.organization_id;

  if (typeof orgId === 'string' && orgId.length > 0) return { orgId };
  return {};
}

// Load logo as base64, fallback to absolute URL
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

/**
 * GET /api/invoices/[id]/pdf
 * Generate and download PDF invoice for an invoice record
 *
 * FIXED: Next.js 15+ route handlers receive params as Promise<{ id: string }>
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const handler = withSentryRoute(
    withAuthRoute(async (req, user) => {
      return generateInvoicePdfResponse(req, user, id);
    })
  );

  return handler(request);
}

async function generateInvoicePdfResponse(
  req: NextRequest,
  user: User,
  id: string
): Promise<Response> {
  const startTime = performance.now();

  try {
    const inline = new URL(req.url).searchParams.get('inline') === 'true';

    // 1) Validate UUID
    if (!validateUUID(id)) {
      const duration = Math.round(performance.now() - startTime);
      logApiRequest(
        'GET',
        `/api/invoices/${id}/pdf`,
        400,
        duration,
        'InvoicesAPI',
        {
          invoiceId: id,
          error: true,
          errorCode: 'INVALID_UUID',
        }
      );

      return NextResponse.json(
        { error: 'Invalid invoice ID format' },
        { status: 400 }
      );
    }

    // 2) Fetch invoice (optionally scoped)
    const supabase = getServerSupabase();
    const { orgId } = getOrgScopeFromUser(user);

    // NOTE: some supabase typings can be annoying about conditional chaining;
    // use `any` for safe conditional org scoping without blowing up TS.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
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

    if (orgId) {
      // If org_id column doesn't exist, Supabase will error -> handled below
      query = query.eq('org_id', orgId);
    }

    const { data: invoice, error: invoiceError } = await query.single();

    if (invoiceError || !invoice) {
      const duration = Math.round(performance.now() - startTime);
      const appError = errorHandler.handleSupabaseError(
        invoiceError || new Error('Invoice not found'),
        'Fetch invoice for PDF'
      );
      const logInfo = createLogErrorInfo(appError);

      logApiRequest(
        'GET',
        `/api/invoices/${id}/pdf`,
        undefined,
        duration,
        'InvoicesAPI',
        {
          invoiceId: id,
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );

      captureException(
        appError,
        'InvoicesAPI.GET',
        { invoiceId: id, duration },
        ErrorSeverity.MEDIUM
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (invoiceError as any)?.code === 'PGRST116' ? 404 : 500;
      const safeError = createSafeErrorResponse(appError, status);
      return NextResponse.json(safeError, { status });
    }

    // Note: Invoice settings were previously loaded here but were not used.
    // If fallback to invoice_settings is needed in the future, uncomment and use this code.

    // 4) Normalize invoice data
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

    const invoiceRecord = invoice as Record<string, unknown>;
    const normalizedInvoice: NormalizedInvoice = {
      invoice_date:
        typeof invoiceRecord.invoice_date === 'string'
          ? invoiceRecord.invoice_date
          : null,
      due_date:
        typeof invoiceRecord.due_date === 'string'
          ? invoiceRecord.due_date
          : null,
      invoice_number:
        typeof invoiceRecord.invoice_number === 'string'
          ? invoiceRecord.invoice_number
          : null,
      currency:
        typeof invoiceRecord.currency === 'string'
          ? invoiceRecord.currency
          : null,
      status:
        typeof invoiceRecord.status === 'string' ? invoiceRecord.status : null,
      notes:
        typeof invoiceRecord.notes === 'string' ? invoiceRecord.notes : null,
      subtotal:
        typeof invoiceRecord.subtotal === 'number'
          ? invoiceRecord.subtotal
          : null,
      tax: typeof invoiceRecord.tax === 'number' ? invoiceRecord.tax : null,
      total:
        typeof invoiceRecord.total === 'number' ? invoiceRecord.total : null,
      client: null,
      items: [],
    };

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
    normalizedInvoice.items = normalizedItems.map(item => ({
      description: item.description,
      qty: item.qty,
      rate: item.rate,
      amount: item.amount,
      image_url: item.image_url,
      item_number: item.instrument?.serial_number || null,
    }));

    // 5) Load logo
    const logoSrc = await resolveLogoSrc();

    // 6) Prepare invoice data
    const invoiceDate =
      normalizedInvoice.invoice_date ?? new Date().toISOString().split('T')[0];
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

    // Prepare company info (from invoice or settings, with fallback)
    const companyName = normalizedInvoice.business_name || STORE_INFO.name;
    const companyAddress = normalizedInvoice.business_address
      ? normalizedInvoice.business_address.split('\n').filter(Boolean)
      : STORE_INFO.addressLines;
    const companyPhone = normalizedInvoice.business_phone || STORE_INFO.phone;
    const companyEmail = normalizedInvoice.business_email || STORE_INFO.email;

    // Prepare banking info (from invoice or settings, with fallback)
    const bankingAccountHolder =
      normalizedInvoice.bank_account_holder || BANKING_INFO.accountHolder;
    const bankingBankName =
      normalizedInvoice.bank_name || BANKING_INFO.bankName;
    const bankingSwiftCode =
      normalizedInvoice.bank_swift_code || BANKING_INFO.swiftCode;
    const bankingAccountNumber =
      normalizedInvoice.bank_account_number || BANKING_INFO.accountNumber;

    // Find first item with item_number (serial_number)
    const itemWithNumber = normalizedInvoice.items.find(
      item => item.item_number && item.item_number.trim()
    );
    const itemNumber = itemWithNumber?.item_number || undefined;

    // Prepare conditions (use default_conditions if available, otherwise notes)
    const conditions =
      normalizedInvoice.default_conditions ||
      normalizedInvoice.notes ||
      undefined;

    // 7) Load React PDF
    const { renderToBuffer: renderToBufferFn, InvoiceDocument: InvoiceDoc } =
      await loadReactPDF();

    // 8) Generate PDF buffer
    const pdfBuffer = await renderToBufferFn(
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
          itemNumber: itemNumber,
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
        conditions: conditions,
      }) as React.ReactElement<DocumentProps>
    );

    // 9) Check PDF size
    if (pdfBuffer.length > MAX_PDF_SIZE) {
      const appError = errorHandler.createError(
        ErrorCodes.FILE_TOO_LARGE,
        'PDF file too large',
        `Generated PDF exceeds maximum size of ${MAX_PDF_SIZE / 1024 / 1024}MB`
      );
      const duration = Math.round(performance.now() - startTime);
      const logInfo = createLogErrorInfo(appError);

      logApiRequest(
        'GET',
        `/api/invoices/${id}/pdf`,
        413,
        duration,
        'InvoicesAPI',
        {
          invoiceId: id,
          error: true,
          logMessage: logInfo.message,
          pdfSize: pdfBuffer.length,
        }
      );

      captureException(
        appError,
        'InvoicesAPI.GET',
        { invoiceId: id, pdfSize: pdfBuffer.length, duration },
        ErrorSeverity.HIGH
      );

      const safeError = createSafeErrorResponse(appError, 413);
      return NextResponse.json(safeError, { status: 413 });
    }

    // 9) Return PDF response
    const duration = Math.round(performance.now() - startTime);
    const filename = `invoice-${normalizedInvoice.invoice_number || id}`;

    logApiRequest(
      'GET',
      `/api/invoices/${id}/pdf`,
      200,
      duration,
      'InvoicesAPI',
      {
        invoiceId: id,
        invoiceNumber: normalizedInvoice.invoice_number || undefined,
        pdfSize: pdfBuffer.length,
      }
    );

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': createContentDisposition(filename, inline),
        'Content-Length': pdfBuffer.length.toString(),
        // ✅ important for user-specific PDFs
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error || new Error('Failed to generate invoice PDF'),
      'Generate invoice PDF'
    );
    const logInfo = createLogErrorInfo(appError);

    logApiRequest(
      'GET',
      `/api/invoices/${id}/pdf`,
      500,
      duration,
      'InvoicesAPI',
      {
        invoiceId: id,
        error: true,
        errorCode: (appError as { code?: string })?.code,
        logMessage: logInfo.message,
      }
    );

    captureException(
      appError,
      'InvoicesAPI.GET',
      { invoiceId: id, duration },
      ErrorSeverity.HIGH
    );

    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}
