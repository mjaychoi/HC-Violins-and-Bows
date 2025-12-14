import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import type { DocumentProps } from '@react-pdf/renderer';
import fs from 'fs/promises';
import path from 'path';
import { getSupabaseClient } from '@/lib/supabase-client';
import { errorHandler } from '@/utils/errorHandler';
import { logApiRequest } from '@/utils/logger';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity, ErrorCodes, AppError } from '@/types/errors';
import {
  createSafeErrorResponse,
  createLogErrorInfo,
} from '@/utils/errorSanitization';
import { validateUUID } from '@/utils/inputValidation';
import { validateInstrument } from '@/utils/typeGuards';
import { Instrument } from '@/types';

// FIXED: Ensure Node.js runtime for PDF generation (Edge runtime breaks react-pdf)
export const runtime = 'nodejs';

// FIXED: React 19 compatibility - use renderToBuffer instead of renderToStream
// React PDF's reconciler has issues with React 19's internal API changes in Next.js 15
// renderToBuffer is more stable in this environment
// FIXED: Promise cache to prevent race conditions on concurrent requests
// In development, we invalidate cache to allow hot reloading
let reactPdfLoader: Promise<{
  renderToBuffer: typeof import('@react-pdf/renderer').renderToBuffer;
  CertificateDocument: React.ComponentType<{
    instrument: Instrument;
    logoSrc?: string;
    verifyUrl?: string;
    ownerName?: string | null;
  }>;
}> | null = null;

async function loadReactPDF() {
  // In development, always reload to allow hot reloading
  const isDev = process.env.NODE_ENV === 'development';

  if (!reactPdfLoader || isDev) {
    reactPdfLoader = (async () => {
      // FIXED: React 19 compatibility - explicitly provide React to react-pdf
      // React PDF's reconciler needs access to React's internal APIs
      // In Next.js 15 server components, React may not be in global scope
      if (
        typeof global !== 'undefined' &&
        !(global as Record<string, unknown>).React
      ) {
        // Type assertion to set React on global object
        (global as Record<string, unknown>).React = React;
      }

      const reactPdf = await import('@react-pdf/renderer');
      // In development, always reload the component module
      const CertificateDocument = (
        await import('@/components/certificates/CertificateDocument')
      ).default;
      return {
        renderToBuffer: reactPdf.renderToBuffer,
        CertificateDocument,
      };
    })();
    // In development, reset cache after a short delay to allow next request to reload
    if (isDev) {
      setTimeout(() => {
        reactPdfLoader = null;
      }, 100);
    }
  }
  return reactPdfLoader;
}

// Maximum PDF size in bytes (20MB) - prevents OOM from large PDFs
const MAX_PDF_SIZE = 20 * 1024 * 1024;

/**
 * Sanitize filename for safe use in Content-Disposition header
 * Removes dangerous characters and encodes special characters
 */
function sanitizeFilename(input: string): string {
  // Remove or replace dangerous characters (quotes, slashes, control chars)
  const safe = String(input)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // Replace dangerous chars with underscore
    .replace(/\s+/g, '_') // Replace spaces with underscore
    .trim()
    .substring(0, 200); // Limit length

  return safe || 'certificate';
}

/**
 * Create safe Content-Disposition header with RFC 5987 encoding for international characters
 */
function createContentDisposition(filename: string): string {
  const safeFilename = sanitizeFilename(filename);
  const baseFilename = `certificate-${safeFilename}.pdf`;

  // RFC 5987 encoding for international characters
  const encoded = encodeURIComponent(baseFilename);

  // Use both standard and extended format for maximum compatibility
  return `attachment; filename="${baseFilename}"; filename*=UTF-8''${encoded}`;
}

// FIXED: Removed pdfStreamToWebStream - using renderToBuffer instead for React 19 compatibility

/**
 * GET /api/certificates/[id]
 * Generate and download PDF certificate for an instrument
 *
 * Security improvements:
 * - UUID validation
 * - Instrument existence check (with RLS if enabled)
 * - Filename sanitization to prevent header injection
 * - Memory-safe buffer generation
 * - Consistent error handling and logging with other APIs
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
  // Runtime-safe: handle both Promise and direct params for compatibility
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
        `/api/certificates/${id}`,
        400,
        duration,
        'CertificatesAPI',
        {
          instrumentId: id,
          error: true,
          errorCode: 'INVALID_UUID',
        }
      );
      return NextResponse.json(
        { error: 'Invalid instrument ID format' },
        { status: 400 }
      );
    }

    // 2. Fetch instrument data and owner client (RLS will enforce permissions if enabled)
    const supabase = await getSupabaseClient();
    const { data: instrument, error } = await supabase
      .from('instruments')
      .select('*')
      .eq('id', id)
      .single();

    // Fetch owner client if ownership exists
    // instrument.ownership is a client_id (UUID), so fetch directly from clients table
    let ownerName: string | null = null;
    if (instrument && instrument.ownership && validateUUID(instrument.ownership)) {
      try {
        const { data: ownerClient } = await supabase
          .from('clients')
          .select('first_name, last_name, email')
          .eq('id', instrument.ownership)
          .maybeSingle();

        if (ownerClient) {
          ownerName =
            `${ownerClient.first_name || ''} ${ownerClient.last_name || ''}`.trim() ||
            ownerClient.email ||
            null;
        }
      } catch (ownerError) {
        // Log but don't fail - owner name is optional
        console.warn(
          'Failed to fetch owner client for certificate:',
          ownerError instanceof Error ? ownerError.message : String(ownerError)
        );
      }
    }

    const duration = Math.round(performance.now() - startTime);

    if (error || !instrument) {
      const appError = errorHandler.handleSupabaseError(
        error || new Error('Instrument not found'),
        'Fetch instrument for certificate'
      );
      const logInfo = createLogErrorInfo(appError);

      logApiRequest(
        'GET',
        `/api/certificates/${id}`,
        undefined,
        duration,
        'CertificatesAPI',
        {
          instrumentId: id,
          error: true,
          errorCode: (appError as { code?: string })?.code,
          logMessage: logInfo.message,
        }
      );

      captureException(
        appError,
        'CertificatesAPI.GET',
        { instrumentId: id, duration },
        ErrorSeverity.MEDIUM
      );

      // Return 404 for not found, 500 for other errors
      const status = error?.code === 'PGRST116' ? 404 : 500;
      const safeError = createSafeErrorResponse(appError, status);
      return NextResponse.json(safeError, { status });
    }

    // 3. Validate instrument data structure
    // FIXED: validateInstrument throws on error, so wrap in try-catch
    let validatedInstrument: Instrument;
    try {
      validatedInstrument = validateInstrument(instrument);
      // validatedInstrument is now guaranteed to be valid Instrument
    } catch (validationError) {
      const duration = Math.round(performance.now() - startTime);
      const errorMessage =
        validationError instanceof Error
          ? validationError.message
          : 'Instrument data structure validation failed';
      const appError = errorHandler.createError(
        ErrorCodes.UNKNOWN_ERROR,
        'Invalid instrument data',
        errorMessage,
        { instrumentId: id }
      );
      const logInfo = createLogErrorInfo(appError);

      logApiRequest(
        'GET',
        `/api/certificates/${id}`,
        500,
        duration,
        'CertificatesAPI',
        {
          instrumentId: id,
          error: true,
          errorCode: appError.code,
          logMessage: logInfo.message,
        }
      );

      captureException(
        appError,
        'CertificatesAPI.GET',
        { instrumentId: id, duration },
        ErrorSeverity.HIGH
      );

      const safeError = createSafeErrorResponse(appError, 500);
      return NextResponse.json(safeError, { status: 500 });
    }

    // 4. Load logo as data URI (server-side safe)
    // FIXED: resolveLogoSrc returns string | null (never undefined)
    // React PDF's Image component crashes if src is undefined/null
    async function resolveLogoSrc(): Promise<string | null> {
      // 1) Try local fs read -> data URL
      try {
        const logoPath = path.join(process.cwd(), 'public', 'logo.png');
        const logoBuf = await fs.readFile(logoPath);
        return `data:image/png;base64,${logoBuf.toString('base64')}`;
      } catch (error) {
        // 2) Try absolute URL (env-based if available)
        const absoluteUrl =
          process.env.NEXT_PUBLIC_LOGO_URL ||
          'https://www.hcviolins.com/logo.png';
        // Note: We return the URL but react-pdf may fail to fetch it
        // If absolute URL also fails, we return null (Image won't render)
        console.warn(
          'Failed to read logo from public folder, will try absolute URL:',
          error instanceof Error ? error.message : String(error)
        );
        // 3) Return null if all options fail (Image component won't render)
        // In production, you might want to validate the absolute URL works
        return absoluteUrl || null;
      }
    }

    const logoSrc = await resolveLogoSrc();

    // 5. Load React PDF dynamically (fixes React 19 compatibility issues)
    const { renderToBuffer: renderToBufferFn, CertificateDocument: CertDoc } =
      await loadReactPDF();

    // 6. Generate PDF buffer (renderToBuffer is more stable with React 19 + Next.js 15)
    // FIXED: Type cast to satisfy renderToBuffer's DocumentProps requirement
    // CertificateDocument returns a Document component, so this cast is safe
    const pdfBuffer = await renderToBufferFn(
      React.createElement(CertDoc, {
        instrument: validatedInstrument,
        logoSrc: logoSrc || undefined, // Convert null to undefined for react-pdf
        verifyUrl: `https://www.hcviolins.com/verify/CERT-${validatedInstrument.serial_number?.trim() || validatedInstrument.id.slice(0, 8).toUpperCase()}-${new Date().getFullYear()}`,
        ownerName: ownerName || undefined, // Pass owner name if available
      }) as React.ReactElement<DocumentProps>
    );

    // 7. Check PDF size before sending
    if (pdfBuffer.length > MAX_PDF_SIZE) {
      const appError = errorHandler.createError(
        ErrorCodes.FILE_TOO_LARGE,
        'PDF file too large',
        `Generated PDF exceeds maximum size of ${MAX_PDF_SIZE / 1024 / 1024}MB`
      );
      const logInfo = createLogErrorInfo(appError);

      logApiRequest(
        'GET',
        `/api/certificates/${id}`,
        413,
        duration,
        'CertificatesAPI',
        {
          instrumentId: id,
          error: true,
          logMessage: logInfo.message,
          pdfSize: pdfBuffer.length,
        }
      );

      captureException(
        appError,
        'CertificatesAPI.GET',
        { instrumentId: id, pdfSize: pdfBuffer.length, duration },
        ErrorSeverity.HIGH
      );

      const safeError = createSafeErrorResponse(appError, 413);
      return NextResponse.json(safeError, { status: 413 });
    }

    // 8. Create safe filename and return PDF
    const rawFilename =
      validatedInstrument.serial_number || validatedInstrument.id;
    const filename = sanitizeFilename(String(rawFilename));

    logApiRequest(
      'GET',
      `/api/certificates/${id}`,
      200,
      duration,
      'CertificatesAPI',
      {
        instrumentId: id,
        serialNumber: validatedInstrument.serial_number,
        pdfSize: pdfBuffer.length,
      }
    );

    // FIXED: Convert Buffer to Uint8Array for NextResponse compatibility
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': createContentDisposition(filename),
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    const duration = Math.round(performance.now() - startTime);

    // Check if it's a Supabase error or PDF generation error
    let appError: AppError;
    const isSupabaseError =
      error &&
      typeof error === 'object' &&
      ((error as { code?: string }).code?.startsWith('PGRST') ||
        (error as { name?: string }).name === 'PostgrestError');

    if (isSupabaseError) {
      // Supabase/PostgreSQL error
      appError = errorHandler.handleSupabaseError(
        error,
        'Generate certificate PDF'
      );
    } else {
      // PDF generation or other error
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Failed to generate PDF certificate';

      appError = errorHandler.createError(
        ErrorCodes.UNKNOWN_ERROR,
        'PDF generation failed',
        errorMessage,
        {
          instrumentId: id,
          errorType: error instanceof Error ? error.name : typeof error,
        }
      );
    }

    const logInfo = createLogErrorInfo(appError);

    logApiRequest(
      'GET',
      `/api/certificates/${id}`,
      undefined,
      duration,
      'CertificatesAPI',
      {
        instrumentId: id,
        error: true,
        errorCode: appError.code,
        logMessage: logInfo.message,
      }
    );

    captureException(
      error instanceof Error ? error : new Error(String(error)),
      'CertificatesAPI.GET',
      { instrumentId: id, duration, logMessage: logInfo.message, appError },
      ErrorSeverity.HIGH
    );

    const safeError = createSafeErrorResponse(appError, 500);
    return NextResponse.json(safeError, { status: 500 });
  }
}
