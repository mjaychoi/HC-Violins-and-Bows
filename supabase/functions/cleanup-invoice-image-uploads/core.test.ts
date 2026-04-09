import {
  buildNoExpiredUploadsResponse,
  cleanupExpiredInvoiceImageUploads,
  type UploadRow,
} from './core';

describe('cleanup-invoice-image-uploads core', () => {
  const invocationId = 'req-456';
  const timestamp = '2026-04-03T12:00:00.000Z';

  it('returns an empty response when there is nothing to clean', () => {
    expect(buildNoExpiredUploadsResponse(timestamp, invocationId)).toEqual({
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
    });
  });

  it('aggregates partial cleanup failures without hiding them', async () => {
    const uploads: UploadRow[] = [
      {
        org_id: 'org-1',
        file_path: 'org-1/file-a.jpg',
        expires_at: timestamp,
      },
      {
        org_id: 'org-1',
        file_path: 'org-1/file-b.jpg',
        expires_at: timestamp,
      },
    ];
    const warnings: string[] = [];

    const response = await cleanupExpiredInvoiceImageUploads({
      uploads,
      invocationId,
      timestamp,
      removeFile: async upload =>
        upload.file_path.endsWith('file-a.jpg')
          ? { error: null }
          : { error: { message: 'storage delete failed' } },
      deleteTrackingRow: async upload =>
        upload.file_path.endsWith('file-a.jpg')
          ? { error: { message: 'tracking delete failed' } }
          : { error: null },
      onWarn: message => warnings.push(message),
    });

    expect(response.status).toBe(207);
    expect(response.payload).toMatchObject({
      message: 'Expired invoice image cleanup completed with failures',
      processed: 2,
      cleaned: 0,
      failed: 2,
      invocation_id: invocationId,
      timestamp,
    });
    expect(response.payload.failures).toEqual([
      {
        file_path: 'org-1/file-a.jpg',
        org_id: 'org-1',
        error: 'tracking delete failed',
      },
      {
        file_path: 'org-1/file-b.jpg',
        org_id: 'org-1',
        error: 'storage delete failed',
      },
    ]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain(invocationId);
  });
});
