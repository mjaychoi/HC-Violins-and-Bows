import { NextRequest, NextResponse } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import { getSupabase } from '@/lib/supabase';
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
import CertificateDocument from '@/components/certificates/CertificateDocument';
import { Instrument } from '@/types';

// Node.js runtime required for Buffer operations and PDF generation
export const runtime = 'nodejs';

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

/**
 * Convert React-PDF stream to Web ReadableStream for NextResponse
 * React-PDF's renderToStream returns an async iterable that yields Uint8Array chunks
 * This function converts it to a Web ReadableStream for efficient streaming
 */
function pdfStreamToWebStream(
  pdfStream: Awaited<ReturnType<typeof renderToStream>>
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      try {
        // React-PDF stream is async iterable
        for await (const chunk of pdfStream) {
          // Handle different chunk types
          let uint8Array: Uint8Array;
          if (typeof chunk === 'string') {
            uint8Array = new Uint8Array(Buffer.from(chunk));
          } else if (Buffer.isBuffer(chunk)) {
            uint8Array = new Uint8Array(chunk);
          } else if (chunk && typeof chunk === 'object') {
            // Check if it's Uint8Array-like or ArrayBuffer
            if (
              'byteLength' in chunk &&
              (chunk as { byteLength: number }).byteLength !== undefined
            ) {
              try {
                uint8Array = new Uint8Array(chunk as ArrayBuffer);
              } catch {
                // Fallback if conversion fails
                uint8Array = new Uint8Array(Buffer.from(String(chunk)));
              }
            } else if (
              'length' in chunk &&
              typeof (chunk as { length: number }).length === 'number'
            ) {
              // Array-like object
              try {
                uint8Array = new Uint8Array(chunk as ArrayLike<number>);
              } catch {
                uint8Array = new Uint8Array(Buffer.from(String(chunk)));
              }
            } else {
              // Fallback: convert to buffer
              uint8Array = new Uint8Array(Buffer.from(String(chunk)));
            }
          } else {
            // Fallback: convert to buffer
            uint8Array = new Uint8Array(Buffer.from(String(chunk)));
          }

          controller.enqueue(uint8Array);
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/**
 * GET /api/certificates/[id]
 * Generate and download PDF certificate for an instrument
 *
 * Security improvements:
 * - UUID validation
 * - Instrument existence check (with RLS if enabled)
 * - Filename sanitization to prevent header injection
 * - Memory-safe streaming (with fallback to buffer for compatibility)
 * - Consistent error handling and logging with other APIs
 *
 * Note: Next.js 15+ route handlers receive params as Promise<{ id: string }>.
 * This matches the TypeScript type definition, though runtime behavior may vary.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = performance.now();
  // Next.js 15 route handlers: params is Promise<{ id: string }>
  // Await to get the actual params object
  const params = await context.params;
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

    // 2. Fetch instrument data (RLS will enforce permissions if enabled)
    const supabase = getSupabase();
    const { data: instrument, error } = await supabase
      .from('instruments')
      .select('*')
      .eq('id', id)
      .single();

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
    const validatedInstrument = validateInstrument(instrument) as Instrument;

    // 4. Generate PDF stream
    const pdfStream = await renderToStream(
      <CertificateDocument
        instrument={validatedInstrument}
        logoSrc="/logo.png"
        verifyUrl={`https://www.hcviolins.com/verify/CERT-${validatedInstrument.serial_number?.trim() || validatedInstrument.id.slice(0, 8).toUpperCase()}-${new Date().getFullYear()}`}
      />
    );

    // 5. Stream PDF to response (memory-safe)
    // Option A: Try streaming (better for large PDFs, memory efficient)
    // React-PDF's renderToStream returns an async iterable compatible with Web ReadableStream
    try {
      // Convert React-PDF async iterable to Web ReadableStream for NextResponse
      const webStream = pdfStreamToWebStream(pdfStream);

      // Create safe filename
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
          streaming: true,
        }
      );

      return new NextResponse(webStream, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': createContentDisposition(filename),
          // Note: Content-Length omitted for streaming responses
        },
      });
    } catch {
      // Fallback: Buffer mode (if streaming fails due to environment/infrastructure)
      // Still apply size limit to prevent OOM
      const chunks: Uint8Array[] = [];
      let totalSize = 0;

      for await (const chunk of pdfStream) {
        // Handle both string and Buffer chunks
        let chunkBuffer: Buffer;
        if (typeof chunk === 'string') {
          chunkBuffer = Buffer.from(chunk);
        } else if (Buffer.isBuffer(chunk)) {
          chunkBuffer = chunk;
        } else {
          chunkBuffer = Buffer.from(chunk);
        }

        totalSize += chunkBuffer.length;

        // Enforce maximum size limit to prevent OOM
        if (totalSize > MAX_PDF_SIZE) {
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
              pdfSize: totalSize,
            }
          );

          captureException(
            appError,
            'CertificatesAPI.GET',
            { instrumentId: id, pdfSize: totalSize, duration },
            ErrorSeverity.HIGH
          );

          const safeError = createSafeErrorResponse(appError, 413);
          return NextResponse.json(safeError, { status: 413 });
        }

        chunks.push(new Uint8Array(chunkBuffer));
      }

      const buffer = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));

      // Create safe filename
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
          pdfSize: buffer.length,
          streaming: false,
        }
      );

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': createContentDisposition(filename),
          'Content-Length': buffer.length.toString(),
        },
      });
    }
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
