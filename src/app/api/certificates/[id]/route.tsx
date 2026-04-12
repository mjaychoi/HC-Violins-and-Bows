import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import type { DocumentProps } from '@react-pdf/renderer';
import fs from 'fs/promises';
import path from 'path';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { AuthContext } from '@/app/api/_utils/withAuthRoute';
import { requireOrgContext } from '@/app/api/_utils/withAuthRoute';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { errorHandler } from '@/utils/errorHandler';
import { logApiRequest } from '@/utils/logger';
import { captureException } from '@/utils/monitoring';
import { ErrorSeverity, ErrorCodes } from '@/types/errors';
import type { AppError } from '@/types/errors';
import {
  createSafeErrorResponse,
  createLogErrorInfo,
} from '@/utils/errorSanitization';
import { validateUUID } from '@/utils/inputValidation';
import { validateInstrument } from '@/utils/typeGuards';
import type { Instrument } from '@/types';
import { createApiErrorResponse } from '@/app/api/_utils/apiErrors';
import {
  getOrCreateRequestId,
  withRequestIdHeader,
} from '@/app/api/_utils/requestContext';

// FIXED: Ensure Node.js runtime for PDF generation (Edge runtime breaks react-pdf)
export const runtime = 'nodejs';

// Maximum PDF size in bytes (20MB) - prevents OOM from large PDFs
const MAX_PDF_SIZE = 20 * 1024 * 1024;

const nowMs = () =>
  typeof globalThis.performance !== 'undefined'
    ? globalThis.performance.now()
    : Date.now();

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
  const isDev = process.env.NODE_ENV === 'development';

  if (!reactPdfLoader || isDev) {
    reactPdfLoader = (async () => {
      // React 19 + Next.js 15 server env: make React available to react-pdf reconciler
      if (
        typeof global !== 'undefined' &&
        !(global as Record<string, unknown>).React
      ) {
        (global as Record<string, unknown>).React = React;
      }

      const reactPdf = await import('@react-pdf/renderer');
      const CertificateDocument = (
        await import('@/components/certificates/CertificateDocument')
      ).default;

      return {
        renderToBuffer: reactPdf.renderToBuffer,
        CertificateDocument,
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

/**
 * Sanitize filename for safe use in Content-Disposition header
 */
function sanitizeFilename(input: string): string {
  const safe = String(input)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .trim()
    .substring(0, 200);

  return safe || 'certificate';
}

/**
 * Create safe Content-Disposition header with RFC 5987 encoding for international characters
 */
function createContentDisposition(filename: string): string {
  const safeFilename = sanitizeFilename(filename);
  const baseFilename = `certificate-${safeFilename}.pdf`;
  const encoded = encodeURIComponent(baseFilename);
  return `attachment; filename="${baseFilename}"; filename*=UTF-8''${encoded}`;
}

/**
 * Build a URL-safe verify code
 */
function buildVerifyUrl(instrument: Instrument): string {
  const serial = (instrument.serial_number ?? '').trim();
  const baseId = serial || instrument.id.slice(0, 8).toUpperCase();
  const year = new Date().getFullYear();
  const code = `CERT-${baseId}-${year}`;

  // Make it URL-safe
  return `https://www.hcviolins.com/verify/${encodeURIComponent(code)}`;
}

/**
 * Load logo as data URI if possible; otherwise fallback to absolute URL (best-effort).
 * (react-pdf may or may not successfully fetch remote URLs depending on environment)
 */
async function resolveLogoSrc(): Promise<string | undefined> {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo.png');
    const logoBuf = await fs.readFile(logoPath);
    return `data:image/png;base64,${logoBuf.toString('base64')}`;
  } catch (e) {
    // Fallback to absolute URL
    const absoluteUrl =
      process.env.NEXT_PUBLIC_LOGO_URL || 'https://www.hcviolins.com/logo.png';
    console.warn(
      'Failed to read logo from public folder; falling back to absolute URL:',
      e instanceof Error ? e.message : String(e)
    );
    return absoluteUrl || undefined;
  }
}

/**
 * GET /api/certificates/[id]
 */
async function getHandlerInternal(
  request: NextRequest,
  auth: AuthContext,
  id: string
) {
  const startTime = nowMs();
  const durationMs = () => Math.round(nowMs() - startTime);
  const routePath = `/api/certificates/${id}`;
  const requestId = getOrCreateRequestId(request);

  try {
    const orgContextError = requireOrgContext(auth);
    if (orgContextError) {
      logApiRequest('GET', routePath, 403, durationMs(), 'CertificatesAPI', {
        instrumentId: id,
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

    // 1) Validate UUID
    if (!validateUUID(id)) {
      logApiRequest('GET', routePath, 400, durationMs(), 'CertificatesAPI', {
        instrumentId: id,
        requestId,
        error: true,
        errorCode: 'INVALID_UUID',
      });

      return withRequestIdHeader(
        createApiErrorResponse(
          {
            message: 'Invalid instrument ID format',
            error_code: 'INVALID_UUID',
            retryable: false,
          },
          400
        ),
        requestId
      );
    }

    // 2) Fetch instrument
    const { data: instrument, error } = await auth.userSupabase
      .from('instruments')
      .select('*')
      .eq('id', id)
      .eq('org_id', auth.orgId!)
      .single();

    // 2b) Optional owner fetch
    let ownerName: string | null = null;
    type InstrumentWithOwnership = Instrument & { ownership?: unknown };
    const ownershipValue = (instrument as InstrumentWithOwnership)?.ownership;
    const ownerId =
      typeof ownershipValue === 'string' && validateUUID(ownershipValue)
        ? ownershipValue
        : undefined;

    if (instrument && ownerId) {
      try {
        const { data: ownerClient } = await auth.userSupabase
          .from('clients')
          .select('name, email')
          .eq('id', ownerId)
          .eq('org_id', auth.orgId!)
          .maybeSingle();

        if (ownerClient) {
          ownerName =
            (ownerClient.name && String(ownerClient.name).trim()) ||
            ownerClient.email ||
            null;
        }
      } catch (ownerError) {
        console.warn(
          'Failed to fetch owner client for certificate:',
          ownerError instanceof Error ? ownerError.message : String(ownerError)
        );
      }
    }

    if (error || !instrument) {
      const appError = errorHandler.handleSupabaseError(
        error || new Error('Instrument not found'),
        'Fetch instrument for certificate'
      );
      const logInfo = createLogErrorInfo(appError);

      // PGRST116: "No rows" (common not-found)
      const errorWithCode = error as { code?: string } | null;
      const status = errorWithCode?.code === 'PGRST116' ? 404 : 500;

      logApiRequest('GET', routePath, status, durationMs(), 'CertificatesAPI', {
        instrumentId: id,
        requestId,
        error: true,
        errorCode: appError.code,
        logMessage: logInfo.message,
      });

      captureException(
        appError instanceof Error ? appError : new Error(String(appError)),
        'CertificatesAPI.GET',
        { instrumentId: id, status, requestId },
        ErrorSeverity.MEDIUM
      );

      return withRequestIdHeader(
        NextResponse.json(createSafeErrorResponse(appError, status), {
          status,
        }),
        requestId
      );
    }

    // 3) Validate instrument structure
    let validatedInstrument: Instrument;
    try {
      validatedInstrument = validateInstrument(instrument);
    } catch (validationError) {
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

      logApiRequest('GET', routePath, 500, durationMs(), 'CertificatesAPI', {
        instrumentId: id,
        requestId,
        error: true,
        errorCode: appError.code,
        logMessage: logInfo.message,
      });

      captureException(
        appError,
        'CertificatesAPI.GET',
        { instrumentId: id, requestId },
        ErrorSeverity.HIGH
      );

      return withRequestIdHeader(
        NextResponse.json(createSafeErrorResponse(appError, 500), {
          status: 500,
        }),
        requestId
      );
    }

    // 4) Resolve logo src
    const logoSrc = await resolveLogoSrc();

    // 5) Load react-pdf
    const { renderToBuffer: renderToBufferFn, CertificateDocument: CertDoc } =
      await loadReactPDF();

    // 6) Generate PDF buffer
    const pdfBuffer = await renderToBufferFn(
      React.createElement(CertDoc, {
        instrument: validatedInstrument,
        // NOTE: If react-pdf <Image> crashes on undefined, fix inside CertificateDocument:
        // render <Image> only when logoSrc is truthy.
        logoSrc,
        verifyUrl: buildVerifyUrl(validatedInstrument),
        ownerName: ownerName ?? undefined,
      }) as React.ReactElement<DocumentProps>
    );

    // 7) Enforce size limit
    if (pdfBuffer.length > MAX_PDF_SIZE) {
      const appError = errorHandler.createError(
        ErrorCodes.FILE_TOO_LARGE,
        'PDF file too large',
        `Generated PDF exceeds maximum size of ${MAX_PDF_SIZE / 1024 / 1024}MB`
      );
      const logInfo = createLogErrorInfo(appError);

      logApiRequest('GET', routePath, 413, durationMs(), 'CertificatesAPI', {
        instrumentId: id,
        requestId,
        error: true,
        errorCode: appError.code,
        logMessage: logInfo.message,
        pdfSize: pdfBuffer.length,
      });

      captureException(
        appError,
        'CertificatesAPI.GET',
        { instrumentId: id, pdfSize: pdfBuffer.length, requestId },
        ErrorSeverity.HIGH
      );

      return withRequestIdHeader(
        NextResponse.json(createSafeErrorResponse(appError, 413), {
          status: 413,
        }),
        requestId
      );
    }

    // 8) Return PDF
    const rawFilename =
      validatedInstrument.serial_number || validatedInstrument.id;
    const filename = sanitizeFilename(String(rawFilename));

    logApiRequest('GET', routePath, 200, durationMs(), 'CertificatesAPI', {
      instrumentId: id,
      serialNumber: validatedInstrument.serial_number,
      pdfSize: pdfBuffer.length,
      requestId,
    });

    return withRequestIdHeader(
      new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': createContentDisposition(filename),
          'Content-Length': pdfBuffer.length.toString(),
        },
      }),
      requestId
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    const isSupabaseError =
      error &&
      typeof error === 'object' &&
      (((error as { code?: string }).code ?? '').startsWith('PGRST') ||
        (error as { name?: string }).name === 'PostgrestError');

    const paramsId = id;
    const appError: AppError = isSupabaseError
      ? errorHandler.handleSupabaseError(error, 'Generate certificate PDF')
      : errorHandler.createError(
          ErrorCodes.UNKNOWN_ERROR,
          'PDF generation failed',
          err.message || 'Failed to generate PDF certificate',
          {
            instrumentId: paramsId,
            errorType: err.name,
          }
        );

    const logInfo = createLogErrorInfo(appError);

    logApiRequest(
      'GET',
      `/api/certificates/${paramsId}`,
      500,
      durationMs(),
      'CertificatesAPI',
      {
        instrumentId: paramsId,
        requestId,
        error: true,
        errorCode: appError.code,
        logMessage: logInfo.message,
      }
    );

    captureException(
      err,
      'CertificatesAPI.GET',
      { instrumentId: paramsId, logMessage: logInfo.message, requestId },
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const p: unknown = context.params;
  const params =
    typeof (p as { then?: unknown })?.then === 'function'
      ? await (p as Promise<{ id: string }>)
      : (p as { id: string });

  const { id } = params;

  const handler = withSentryRoute(
    withAuthRoute(async (req: NextRequest, auth: AuthContext) => {
      return getHandlerInternal(req, auth, id);
    })
  );

  return handler(request);
}
