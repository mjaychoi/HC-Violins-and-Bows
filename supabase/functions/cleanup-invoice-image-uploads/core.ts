export type UploadRow = {
  org_id: string;
  file_path: string;
  expires_at: string | null;
};

export type CleanupFailure = {
  file_path: string;
  org_id: string;
  error: string;
};

export type CleanupWorkerResponse = {
  status: number;
  payload: {
    message: string;
    processed: number;
    cleaned: number;
    failed: number;
    failures: CleanupFailure[];
    invocation_id: string;
    timestamp: string;
  };
};

type CleanupArgs = {
  uploads: UploadRow[];
  invocationId: string;
  timestamp: string;
  removeFile: (
    upload: UploadRow
  ) => Promise<{ error: { message: string } | null }>;
  deleteTrackingRow: (
    upload: UploadRow
  ) => Promise<{ error: { message: string } | null }>;
  onWarn?: (message: string) => void;
};

export function buildNoExpiredUploadsResponse(
  timestamp: string,
  invocationId: string
): CleanupWorkerResponse {
  return {
    status: 200,
    payload: {
      message: 'No expired invoice image uploads to clean up',
      processed: 0,
      cleaned: 0,
      failed: 0,
      failures: [],
      invocation_id: invocationId,
      timestamp,
    },
  };
}

export async function cleanupExpiredInvoiceImageUploads({
  uploads,
  invocationId,
  timestamp,
  removeFile,
  deleteTrackingRow,
  onWarn,
}: CleanupArgs): Promise<CleanupWorkerResponse> {
  let cleaned = 0;
  let failed = 0;
  const failures: CleanupFailure[] = [];

  for (const upload of uploads) {
    const { error: storageError } = await removeFile(upload);

    if (storageError) {
      failed += 1;
      const failure = {
        file_path: upload.file_path,
        org_id: upload.org_id,
        error: storageError.message,
      };
      failures.push(failure);
      onWarn?.(
        `[${invocationId}] Failed to delete expired invoice image ${upload.file_path}: ${storageError.message}`
      );
      continue;
    }

    const { error: deleteError } = await deleteTrackingRow(upload);

    if (deleteError) {
      failed += 1;
      const failure = {
        file_path: upload.file_path,
        org_id: upload.org_id,
        error: deleteError.message,
      };
      failures.push(failure);
      onWarn?.(
        `[${invocationId}] Deleted expired invoice image file but failed to delete tracking row ${upload.file_path}: ${deleteError.message}`
      );
      continue;
    }

    cleaned += 1;
  }

  return {
    status: failed > 0 ? 207 : 200,
    payload: {
      message:
        failed > 0
          ? 'Expired invoice image cleanup completed with failures'
          : 'Expired invoice image cleanup completed',
      processed: uploads.length,
      cleaned,
      failed,
      failures,
      invocation_id: invocationId,
      timestamp,
    },
  };
}
