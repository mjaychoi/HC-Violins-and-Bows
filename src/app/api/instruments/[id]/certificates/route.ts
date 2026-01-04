import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase-server';
import { validateUUID } from '@/utils/inputValidation';
import { withSentryRoute } from '@/app/api/_utils/withSentryRoute';
import { withAuthRoute } from '@/app/api/_utils/withAuthRoute';
import type { User } from '@supabase/supabase-js';
import { getStorage } from '@/utils/storage';
import { errorHandler } from '@/utils/errorHandler';
import { logError, logInfo } from '@/utils/logger';
// Storage instance (singleton)
const storage = getStorage();
const SIGNED_URL_TTL_SECONDS = 60;
const MAX_CERTIFICATE_SIZE = 100 * 1024 * 1024;

const isMissingTableError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  return (
    err.code === '42P01' ||
    Boolean(err.message?.includes('instrument_certificates'))
  );
};

// Note: S3Storage doesn't have list functionality, so we rely on metadata table only

/**
 * GET /api/instruments/[id]/certificates
 * List all certificate files for an instrument
 */
async function getHandlerInternal(
  request: NextRequest,
  _user: User,
  id: string
) {
  void _user;

  try {
    // Validate UUID
    if (!validateUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid instrument ID format' },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    // Check if instrument exists
    const { data: instrument, error: instrumentError } = await supabase
      .from('instruments')
      .select('id, serial_number')
      .eq('id', id)
      .single();

    if (instrumentError || !instrument) {
      return NextResponse.json(
        { error: 'Instrument not found' },
        { status: 404 }
      );
    }

    const { data: certRows, error: certError } = await supabase
      .from('instrument_certificates')
      .select(
        'id, storage_path, original_name, mime_type, size, created_at, version, is_primary'
      )
      .eq('instrument_id', id)
      .order('created_at', { ascending: false });

    if (!certError && certRows && certRows.length > 0) {
      const certificateFiles = await Promise.all(
        certRows.map(async row => {
          const fileKey = row.storage_path;
          let signedUrl = '';
          try {
            signedUrl = await storage.presignPut(
              fileKey,
              row.mime_type || 'application/pdf',
              SIGNED_URL_TTL_SECONDS
            );
          } catch (presignError) {
            logError('Failed to generate presigned URL:', presignError);
            logInfo('signedUrl:', signedUrl);
          }
          const name = row.original_name || fileKey.split('/').pop() || fileKey;
          return {
            id: row.id,
            name,
            path: fileKey,
            size: row.size || 0,
            createdAt: row.created_at || null,
          };
        })
      );

      return NextResponse.json({
        data: certificateFiles,
      });
    }

    if (certError) {
      logError('Certificate list error:', certError);
      return NextResponse.json(
        { error: 'Failed to list certificate files' },
        { status: 500 }
      );
    }

    // No certificates found
    return NextResponse.json({
      data: [],
    });
  } catch (error) {
    logError('Certificate list error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to list certificates',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/instruments/[id]/certificates
 * Upload certificate file for an instrument
 */
async function postHandlerInternal(
  request: NextRequest,
  user: User,
  id: string
) {
  try {
    if (!validateUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid instrument ID format' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('certificate') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No certificate file provided' },
        { status: 400 }
      );
    }

    const normalizedType = (file.type || '').toLowerCase();
    const isPdfType =
      normalizedType === 'application/pdf' ||
      normalizedType === 'application/x-pdf';
    const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');
    if (!isPdfType && !hasPdfExtension) {
      return NextResponse.json(
        { error: 'Certificate must be a PDF file' },
        { status: 400 }
      );
    }

    if (file.size > MAX_CERTIFICATE_SIZE) {
      return NextResponse.json(
        { error: 'Certificate file size must be less than 100MB' },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    const { data: instrument, error: instrumentError } = await supabase
      .from('instruments')
      .select('id, serial_number')
      .eq('id', id)
      .single();

    if (instrumentError || !instrument) {
      return NextResponse.json(
        { error: 'Instrument not found' },
        { status: 404 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const timestamp = Date.now();
    const safeFilename = file.name
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/\s+/g, '_');
    const fileKey = `certificates/${id}/${timestamp}_${safeFilename}`;

    // Validate file before upload
    storage.validateFile(file.name, 'application/pdf', file.size);

    // Upload to storage
    try {
      await storage.saveFile(buffer, fileKey, 'application/pdf');
    } catch (uploadError) {
      logError('Certificate upload error:', uploadError);
      throw new Error(
        `Failed to upload certificate: ${
          uploadError instanceof Error
            ? uploadError.message
            : String(uploadError)
        }`
      );
    }

    let insertedId: string | null = null;
    const { data: existingRows, error: existingError } = await supabase
      .from('instrument_certificates')
      .select('id, version, is_primary')
      .eq('instrument_id', id);

    if (!existingError && Array.isArray(existingRows)) {
      const maxVersion = existingRows.reduce(
        (acc, row) => Math.max(acc, row.version || 0),
        0
      );
      const hasPrimary = existingRows.some(row => row.is_primary);

      const { data: insertedRow, error: insertError } = await supabase
        .from('instrument_certificates')
        .insert({
          instrument_id: id,
          storage_path: fileKey,
          original_name: file.name,
          mime_type: 'application/pdf',
          size: file.size,
          created_by: user.id,
          is_primary: !hasPrimary,
          version: maxVersion + 1,
        })
        .select('id')
        .single();

      if (insertError) {
        try {
          await storage.deleteFile(fileKey);
        } catch (deleteError) {
          logError('Failed to rollback file upload:', deleteError);
        }
        throw errorHandler.handleSupabaseError(
          insertError,
          'Save certificate metadata'
        );
      }

      insertedId = insertedRow?.id || null;
    } else if (existingError && !isMissingTableError(existingError)) {
      try {
        await storage.deleteFile(fileKey);
      } catch (deleteError) {
        logError('Failed to rollback file upload:', deleteError);
      }
      throw errorHandler.handleSupabaseError(
        existingError,
        'Read certificate metadata'
      );
    }

    const { error: updateError } = await supabase
      .from('instruments')
      .update({ certificate: true })
      .eq('id', id);

    if (updateError) {
      if (insertedId) {
        await supabase
          .from('instrument_certificates')
          .delete()
          .eq('id', insertedId);
      }
      try {
        await storage.deleteFile(fileKey);
      } catch (deleteError) {
        logError('Failed to rollback file upload:', deleteError);
      }
      throw errorHandler.handleSupabaseError(updateError, 'Update instrument');
    }

    let signedUrl = '';
    try {
      signedUrl = await storage.presignPut(
        fileKey,
        'application/pdf',
        SIGNED_URL_TTL_SECONDS
      );
    } catch (presignError) {
      logError('Failed to generate presigned URL:', presignError);
      signedUrl = storage.getFileUrl(fileKey);
    }

    return NextResponse.json({
      success: true,
      id: insertedId,
      filePath: fileKey,
      publicUrl: signedUrl,
      message: 'Certificate uploaded successfully',
    });
  } catch (error) {
    logError('Certificate upload error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to upload certificate',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/instruments/[id]/certificates?file=...
 * Replace an existing certificate file with a new PDF
 */
async function putHandlerInternal(
  request: NextRequest,
  _user: User,
  id: string
) {
  try {
    if (!validateUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid instrument ID format' },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const fileName = url.searchParams.get('file');
    if (!fileName) {
      return NextResponse.json(
        { error: 'File name is required' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('certificate') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No certificate file provided' },
        { status: 400 }
      );
    }

    const normalizedType = (file.type || '').toLowerCase();
    const isPdfType =
      normalizedType === 'application/pdf' ||
      normalizedType === 'application/x-pdf';
    const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');
    if (!isPdfType && !hasPdfExtension) {
      return NextResponse.json(
        { error: 'Certificate must be a PDF file' },
        { status: 400 }
      );
    }

    if (file.size > MAX_CERTIFICATE_SIZE) {
      return NextResponse.json(
        { error: 'Certificate file size must be less than 100MB' },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    // Find certificate by fileName in metadata table
    const { data: certRows, error: certError } = await supabase
      .from('instrument_certificates')
      .select('storage_path')
      .eq('instrument_id', id)
      .order('created_at', { ascending: false });

    if (certError) {
      return NextResponse.json(
        { error: 'Failed to find certificate files' },
        { status: 404 }
      );
    }

    const existing = certRows?.find(row => {
      const pathParts = row.storage_path.split('/');
      return pathParts[pathParts.length - 1] === fileName;
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Certificate file not found' },
        { status: 404 }
      );
    }

    const fileKey = existing.storage_path;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate file before upload
    storage.validateFile(file.name, 'application/pdf', file.size);

    // Upload to storage (replace existing file)
    try {
      await storage.saveFile(buffer, fileKey, 'application/pdf');
    } catch (uploadError) {
      logError('Certificate replace error:', uploadError);
      throw new Error(
        `Failed to replace certificate: ${
          uploadError instanceof Error
            ? uploadError.message
            : String(uploadError)
        }`
      );
    }

    const { error: updateMetaError } = await supabase
      .from('instrument_certificates')
      .update({
        original_name: file.name,
        mime_type: 'application/pdf',
        size: file.size,
      })
      .eq('instrument_id', id)
      .eq('storage_path', fileKey);

    if (updateMetaError && !isMissingTableError(updateMetaError)) {
      logError('Certificate metadata update error:', updateMetaError);
    }

    let signedUrl = '';
    try {
      signedUrl = await storage.presignPut(
        fileKey,
        'application/pdf',
        SIGNED_URL_TTL_SECONDS
      );
    } catch (presignError) {
      logError('Failed to generate presigned URL:', presignError);
      signedUrl = storage.getFileUrl(fileKey);
    }

    return NextResponse.json({
      success: true,
      filePath: fileKey,
      publicUrl: signedUrl,
      message: 'Certificate replaced successfully',
    });
  } catch (error) {
    logError('Certificate replace error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to replace certificate',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/instruments/[id]/certificates
 * Delete a specific certificate file for an instrument
 */
async function deleteHandlerInternal(
  request: NextRequest,
  _user: User,
  id: string
) {
  try {
    if (!validateUUID(id)) {
      return NextResponse.json(
        { error: 'Invalid instrument ID format' },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const fileName = url.searchParams.get('file');
    const certificateId = url.searchParams.get('id');

    if (!fileName && !certificateId) {
      return NextResponse.json(
        { error: 'File name or certificate id is required' },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    const { data: instrument, error: instrumentError } = await supabase
      .from('instruments')
      .select('id')
      .eq('id', id)
      .single();

    if (instrumentError || !instrument) {
      return NextResponse.json(
        { error: 'Instrument not found' },
        { status: 404 }
      );
    }

    let filePath: string | null = null;

    if (certificateId) {
      const { data: certRow, error: certError } = await supabase
        .from('instrument_certificates')
        .select()
        .eq('id', certificateId)
        .eq('instrument_id', id)
        .single();

      if (certError && !isMissingTableError(certError)) {
        logError('Certificate lookup error:', certError);
        return NextResponse.json(
          { error: 'Failed to find certificate file' },
          { status: 404 }
        );
      }

      if (certRow?.storage_path) {
        filePath = certRow.storage_path;
      }
    }

    if (!filePath && fileName) {
      // Find certificate by fileName in metadata table
      const { data: certRows, error: certError } = await supabase
        .from('instrument_certificates')
        .select('storage_path')
        .eq('instrument_id', id);

      if (certError) {
        return NextResponse.json(
          { error: 'Failed to find certificate files' },
          { status: 404 }
        );
      }

      const existing = certRows?.find(row => {
        const pathParts = row.storage_path.split('/');
        return pathParts[pathParts.length - 1] === fileName;
      });

      if (!existing) {
        return NextResponse.json(
          { error: 'Certificate file not found' },
          { status: 404 }
        );
      }

      filePath = existing.storage_path;
    }

    if (!filePath) {
      return NextResponse.json(
        { error: 'Certificate file not found' },
        { status: 404 }
      );
    }

    try {
      await storage.deleteFile(filePath);
    } catch (deleteError) {
      logError('Certificate delete error:', deleteError);
      // Continue with metadata deletion even if storage deletion fails
    }

    if (certificateId) {
      const { error: deleteMetaError } = await supabase
        .from('instrument_certificates')
        .delete()
        .eq('id', certificateId)
        .eq('instrument_id', id);

      if (deleteMetaError && !isMissingTableError(deleteMetaError)) {
        logError('Certificate metadata delete error:', deleteMetaError);
      }
    } else {
      const { error: deleteMetaError } = await supabase
        .from('instrument_certificates')
        .delete()
        .eq('instrument_id', id)
        .eq('storage_path', filePath);

      if (deleteMetaError && !isMissingTableError(deleteMetaError)) {
        logError('Certificate metadata delete error:', deleteMetaError);
      }
    }

    // Check if any certificates remain using metadata table
    const { data: remainingCerts } = await supabase
      .from('instrument_certificates')
      .select('id')
      .eq('instrument_id', id)
      .limit(1);

    if (!remainingCerts || remainingCerts.length === 0) {
      const { error: updateError } = await supabase
        .from('instruments')
        .update({ certificate: false })
        .eq('id', id);

      if (updateError) {
        logError('Failed to update instrument certificate flag:', updateError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Certificate deleted successfully',
    });
  } catch (error) {
    logError('Certificate delete error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to delete certificate',
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // FIXED: Next.js 15+ route handlers: params is Promise<{ id: string }>
  const p: unknown = context.params;
  const params =
    typeof (p as { then?: unknown })?.then === 'function'
      ? await (p as Promise<{ id: string }>)
      : (p as { id: string });

  const { id } = params;

  // Wrap handler with auth and sentry
  const handler = withSentryRoute(
    withAuthRoute(async (req: NextRequest, user: User) => {
      return getHandlerInternal(req, user, id);
    })
  );

  return handler(request);
}

export async function POST(
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
    withAuthRoute(async (req: NextRequest, user: User) => {
      return postHandlerInternal(req, user, id);
    })
  );

  return handler(request);
}

export async function PUT(
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
    withAuthRoute(async (req: NextRequest, user: User) => {
      return putHandlerInternal(req, user, id);
    })
  );

  return handler(request);
}

export async function DELETE(
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
    withAuthRoute(async (req: NextRequest, user: User) => {
      return deleteHandlerInternal(req, user, id);
    })
  );

  return handler(request);
}
