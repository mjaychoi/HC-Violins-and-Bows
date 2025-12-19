import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import type { DocumentProps } from '@react-pdf/renderer';
import fs from 'fs/promises';
import path from 'path';
import { getSupabaseClient } from '@/lib/supabase-client';
import { errorHandler } from '@/utils/errorHandler';
import { logApiRequest } from '@/utils/logger';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity, ErrorCodes } from '@/types/errors';
import {
  createSafeErrorResponse,
  createLogErrorInfo,
} from '@/utils/errorSanitization';
import { validateUUID } from '@/utils/inputValidation';
import type { InvoiceDocumentProps } from '@/components/invoices/InvoiceDocument';

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

function createContentDisposition(filename: string): string {
  const safeFilename = sanitizeFilename(filename);
  const baseFilename = `invoice-${safeFilename}.pdf`;
  const encoded = encodeURIComponent(baseFilename);
  return `attachment; filename="${baseFilename}"; filename*=UTF-8''${encoded}`;
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

/**
 * GET /api/invoices/[id]
 * Generate and download PDF invoice for a sale
 *
 * FIXED: Next.js 15+ route handlers receive params as Promise<{ id: string }>
 * TypeScript requires Promise type, but runtime-safe handling for compatibility
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = performance.now();
  // FIXED: Next.js 15+ route handlers: params is Promise<{ id: string }>
  const p: unknown = context.params;
  const params =
    typeof (p as { then?: unknown })?.then === 'function'
      ? await (p as Promise<{ id: string }>)
      : (p as { id: string });
  const { id } = params;

  try {
    // 1. Validate UUID format (consistent with other APIs)
    if (!validateUUID(id)) {
      const duration = Math.round(performance.now() - startTime);
      logApiRequest(
        'GET',
        `/api/invoices/${id}`,
        400,
        duration,
        'InvoicesAPI',
        {
          saleId: id,
          error: true,
          errorCode: 'INVALID_UUID',
        }
      );
      return NextResponse.json(
        { error: 'Invalid sale ID format' },
        { status: 400 }
      );
    }

    // 2. Fetch sale data
    const supabase = await getSupabaseClient();
    const { data: sale, error: saleError } = await supabase
      .from('sales_history')
      .select('*')
      .eq('id', id)
      .single();

    if (saleError || !sale) {
      const duration = Math.round(performance.now() - startTime);
      const appError = errorHandler.handleSupabaseError(
        saleError || new Error('Sale not found'),
        'Fetch sale for invoice'
      );
      const logInfo = createLogErrorInfo(appError);

      logApiRequest(
        'GET',
        `/api/invoices/${id}`,
        undefined,
        duration,
        'InvoicesAPI',
        {
          saleId: id,
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );

      captureException(
        appError,
        'InvoicesAPI.GET',
        { saleId: id, duration },
        ErrorSeverity.MEDIUM
      );

      const status = saleError?.code === 'PGRST116' ? 404 : 500;
      const safeError = createSafeErrorResponse(appError, status);
      return NextResponse.json(safeError, { status });
    }

    // 3. Fetch client and instrument separately
    let client = null;
    let instrument = null;

    if (sale.client_id) {
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', sale.client_id)
        .single();
      if (!clientError && clientData) {
        client = clientData;
      }
    }

    if (sale.instrument_id) {
      const { data: instrumentData, error: instrumentError } = await supabase
        .from('instruments')
        .select('*')
        .eq('id', sale.instrument_id)
        .single();
      if (!instrumentError && instrumentData) {
        instrument = instrumentData;
      }
    }

    // 4. Load logo
    async function resolveLogoSrc(): Promise<string | null> {
      try {
        const logoPath = path.join(process.cwd(), 'public', 'logo.png');
        const logoBuf = await fs.readFile(logoPath);
        return `data:image/png;base64,${logoBuf.toString('base64')}`;
      } catch (error) {
        const absoluteUrl =
          process.env.NEXT_PUBLIC_LOGO_URL ||
          'https://www.hcviolins.com/logo.png';
        console.warn(
          'Failed to read logo from public folder, will try absolute URL:',
          error instanceof Error ? error.message : String(error)
        );
        return absoluteUrl || null;
      }
    }

    const logoSrc = await resolveLogoSrc();

    // 5. Prepare invoice data

    // Format date
    const saleDate = sale.sale_date || new Date().toISOString().split('T')[0];
    const formattedDate = saleDate.replace(/-/g, '.');

    // Build item description
    const descriptionParts: string[] = [];
    if (instrument?.type) descriptionParts.push(instrument.type);
    if (instrument?.maker) descriptionParts.push(instrument.maker);
    if (instrument?.year) descriptionParts.push(String(instrument.year));
    if (instrument?.certificate) descriptionParts.push('with certificate');
    if (sale.notes) descriptionParts.push(sale.notes);
    const itemDescription = descriptionParts.join(', ') || 'Instrument sale';

    // Invoice number (use sale ID first 8 chars)
    const invoiceNumber = `INV-${id.slice(0, 8).toUpperCase()}`;

    // Item number (use instrument serial or ID)
    const itemNumber =
      instrument?.serial_number || instrument?.id?.slice(0, 8) || '';

    // Build billTo address
    const billToAddressLines: string[] = [];
    if (client?.first_name || client?.last_name) {
      // Address lines would come from client data if available
      // For now, just use name
    }

    // 6. Load React PDF
    const { renderToBuffer: renderToBufferFn, InvoiceDocument: InvoiceDoc } =
      await loadReactPDF();

    // 7. Generate PDF buffer
    // FIXED: Type cast to satisfy renderToBuffer's DocumentProps requirement
    // InvoiceDocument returns a Document component, so this cast is safe
    const pdfBuffer = await renderToBufferFn(
      React.createElement(InvoiceDoc, {
        logoSrc: logoSrc || undefined,
        company: STORE_INFO,
        billTo: {
          name: (() => {
            if (!client) return 'Customer';
            const fullName =
              `${client.first_name || ''} ${client.last_name || ''}`.trim();
            if (fullName) return fullName;
            if (client.email) return client.email;
            return 'Customer';
          })(),
          addressLines:
            billToAddressLines.length > 0 ? billToAddressLines : undefined,
          phone: client?.contact_number || undefined,
        },
        shipTo: {
          note: sale.notes || undefined,
        },
        invoice: {
          invoiceNumber,
          itemNumber: itemNumber || undefined,
          date: formattedDate,
          currency: 'USD',
          status: sale.sale_price < 0 ? 'Refunded' : 'Paid',
        },
        items: [
          {
            description: itemDescription,
            qty: 1,
            rate: Math.abs(sale.sale_price),
          },
        ],
        banking: BANKING_INFO,
        totals: {
          subtotal: Math.abs(sale.sale_price),
          tax: 0,
          total: Math.abs(sale.sale_price),
        },
      }) as React.ReactElement<DocumentProps> // Type assertion: InvoiceDocument returns Document which satisfies DocumentProps
    );

    // 8. Check PDF size
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
        `/api/invoices/${id}`,
        413,
        duration,
        'InvoicesAPI',
        {
          saleId: id,
          error: true,
          logMessage: logInfo.message,
          pdfSize: pdfBuffer.length,
        }
      );

      captureException(
        appError,
        'InvoicesAPI.GET',
        { saleId: id, pdfSize: pdfBuffer.length, duration },
        ErrorSeverity.HIGH
      );

      const safeError = createSafeErrorResponse(appError, 413);
      return NextResponse.json(safeError, { status: 413 });
    }

    // 9. Return PDF response
    const duration = Math.round(performance.now() - startTime);
    const filename = `invoice-${invoiceNumber}`;

    logApiRequest('GET', `/api/invoices/${id}`, 200, duration, 'InvoicesAPI', {
      saleId: id,
      invoiceNumber,
      pdfSize: pdfBuffer.length,
    });

    // FIXED: Convert Buffer to Uint8Array for NextResponse compatibility
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': createContentDisposition(filename),
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);
    const appError = errorHandler.handleSupabaseError(
      error || new Error('Failed to generate invoice'),
      'Generate invoice PDF'
    );
    const logInfo = createLogErrorInfo(appError);

    logApiRequest('GET', `/api/invoices/${id}`, 500, duration, 'InvoicesAPI', {
      saleId: id,
      error: true,
      errorCode: (appError as { code?: string })?.code,
      logMessage: logInfo.message,
    });

    captureException(
      appError,
      'InvoicesAPI.GET',
      { saleId: id, duration },
      ErrorSeverity.HIGH
    );

    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}
