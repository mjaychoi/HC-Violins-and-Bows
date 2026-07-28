import type { NextRequest } from 'next/server';
import { validateUUID } from '@/utils/inputValidation';
import { getStorage } from '@/utils/storage';
import { GET, POST, PUT, DELETE } from '../route';

const mockStorage = {
  validateFile: jest.fn(),
  saveFile: jest.fn(),
  deleteFile: jest.fn(),
  fileExists: jest.fn(),
  presignPut: jest.fn(),
  presignGet: jest.fn(),
  getFileUrl: jest.fn((key: string) => `https://example.com/${key}`),
};

let mockAuthContext: {
  user: { id: string };
  accessToken: string;
  orgId: string | null;
  clientId: string | null;
  role: 'admin' | 'member';
  userSupabase: {
    from: jest.Mock;
    rpc: jest.Mock;
  };
  isTestBypass: boolean;
};

jest.mock('@/utils/inputValidation', () => ({
  validateUUID: jest.fn(),
}));

jest.mock('@/utils/storage', () => ({
  getStorage: jest.fn(() => mockStorage),
}));

jest.mock('@/utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logApiRequest: jest.fn(),
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
  tooManyRequestsApiResult: () => ({
    payload: { error: 'Too many requests', success: false },
    status: 429,
  }),
}));

jest.mock('@/utils/errorHandler', () => ({
  errorHandler: {
    handleSupabaseError: jest.fn((error: unknown, context: string) => {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' &&
              error &&
              'message' in error &&
              typeof (error as { message?: unknown }).message === 'string'
            ? (error as { message: string }).message
            : context;

      return new Error(message);
    }),
  },
}));

jest.mock('@/app/api/_utils/withSentryRoute', () => ({
  withSentryRoute: (fn: unknown) => fn,
}));

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute:
      (handler: (req: Request, auth: unknown, ctx?: unknown) => unknown) =>
      async (request: NextRequest, context?: unknown) =>
        handler(request, mockAuthContext, context),
  };
});

const mockValidateUUID = validateUUID as jest.MockedFunction<
  typeof validateUUID
>;
const mockGetStorage = getStorage as jest.MockedFunction<typeof getStorage>;

const instrumentId = '123e4567-e89b-12d3-a456-426614174000';
const certificateId = '223e4567-e89b-12d3-a456-426614174000';
const oldFileKey =
  'org-1/123e4567-e89b-12d3-a456-426614174000/old-certificate.pdf';

type AwaitableChain = {
  select: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  eq: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  single: jest.Mock;
  maybeSingle: jest.Mock;
  then: jest.Mock;
  catch: jest.Mock;
  finally: jest.Mock;
};

function createAwaitableChain(result: Record<string, unknown>): AwaitableChain {
  const promise = Promise.resolve(result);
  const chain = {} as AwaitableChain;
  Object.assign(chain, {
    select: jest.fn(() => chain),
    update: jest.fn(() => chain),
    delete: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    single: jest.fn(() => promise),
    maybeSingle: jest.fn(() => promise),
    then: jest.fn((onFulfilled, onRejected) =>
      promise.then(onFulfilled, onRejected)
    ),
    catch: jest.fn(onRejected => promise.catch(onRejected)),
    finally: jest.fn(onFinally => promise.finally(onFinally)),
  });

  return chain;
}

function createPutRequest(fileName = 'replacement.pdf') {
  const replacementFile = {
    name: fileName,
    type: 'application/pdf',
    size: 3,
    arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')),
  };

  return {
    url: `http://localhost/api/instruments/${instrumentId}/certificates?file=old-certificate.pdf`,
    formData: jest.fn().mockResolvedValue({
      get: jest.fn().mockReturnValue(replacementFile),
    }),
  } as unknown as NextRequest;
}

function createPostRequest(fileName = 'certificate.pdf') {
  const certificateFile = {
    name: fileName,
    type: 'application/pdf',
    size: 3,
    arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')),
  };

  return {
    url: `http://localhost/api/instruments/${instrumentId}/certificates`,
    formData: jest.fn().mockResolvedValue({
      get: jest.fn().mockReturnValue(certificateFile),
    }),
  } as unknown as NextRequest;
}

function createGetRequest() {
  return {
    url: `http://localhost/api/instruments/${instrumentId}/certificates`,
  } as unknown as NextRequest;
}

describe('/api/instruments/[id]/certificates fail-closed flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockValidateUUID.mockReturnValue(true);
    mockGetStorage.mockReturnValue(mockStorage as never);

    mockStorage.validateFile.mockReturnValue(undefined);
    mockStorage.saveFile.mockResolvedValue('saved-key');
    mockStorage.deleteFile.mockResolvedValue(true);
    mockStorage.fileExists.mockResolvedValue(true);
    mockStorage.presignPut.mockResolvedValue('https://example.com/signed');
    mockStorage.presignGet.mockResolvedValue(
      `https://presigned.example.com/${oldFileKey}`
    );

    mockAuthContext = {
      user: { id: 'user-1' },
      accessToken: 'token',
      orgId: 'org-1',
      clientId: null,
      role: 'admin',
      userSupabase: {
        from: jest.fn(),
        rpc: jest.fn(),
      },
      isTestBypass: false,
    };
  });

  it('rejects missing org context before any certificate lookup', async () => {
    mockAuthContext.orgId = null;

    const response = await PUT(createPutRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.message).toBe('Organization context required');
    expect(mockAuthContext.userSupabase.from).not.toHaveBeenCalled();
    expect(mockStorage.saveFile).not.toHaveBeenCalled();
  });

  it('rejects GET without organization context before any lookup', async () => {
    mockAuthContext.orgId = null;

    const response = await GET(createGetRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.message).toBe('Organization context required');
    expect(mockAuthContext.userSupabase.from).not.toHaveBeenCalled();
  });

  it('rejects an invalid instrument UUID before GET lookup', async () => {
    mockValidateUUID.mockReturnValueOnce(false);

    const response = await GET(createGetRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.message).toBe('Invalid instrument ID format');
    expect(mockAuthContext.userSupabase.from).not.toHaveBeenCalled();
  });

  it('fails closed when GET cannot find the instrument in the organization', async () => {
    const instrumentChain = createAwaitableChain({
      data: null,
      error: { message: 'Instrument not found' },
    });
    mockAuthContext.userSupabase.from.mockReturnValue(instrumentChain);

    const response = await GET(createGetRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.message).toBe('Instrument not found');
    expect(instrumentChain.eq).toHaveBeenCalledWith('id', instrumentId);
    expect(instrumentChain.eq).toHaveBeenCalledWith('org_id', 'org-1');
    expect(mockStorage.fileExists).not.toHaveBeenCalled();
  });

  it('returns an empty GET list for an owned instrument with no PDFs', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId, serial_number: 'SN-1' },
      error: null,
    });
    const listChain = createAwaitableChain({ data: [], error: null });
    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') return instrumentChain;
      if (table === 'instrument_certificates') return listChain;
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await GET(createGetRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual([]);
    expect(listChain.eq).toHaveBeenCalledWith('instrument_id', instrumentId);
    expect(listChain.eq).toHaveBeenCalledWith('instruments.org_id', 'org-1');
  });

  it('returns certificate metadata only when the object exists and a signed URL is generated', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId, serial_number: 'SN-1' },
      error: null,
    });
    const listChain = createAwaitableChain({
      data: [
        {
          id: certificateId,
          storage_path: oldFileKey,
          original_name: 'old-certificate.pdf',
          mime_type: 'application/pdf',
          size: 3,
          created_at: '2024-01-01T00:00:00Z',
          version: 1,
          is_primary: false,
          instruments: { org_id: 'org-1' },
        },
      ],
      error: null,
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') return instrumentChain;
      if (table === 'instrument_certificates') return listChain;
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await GET(createGetRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockStorage.fileExists).toHaveBeenCalledWith(oldFileKey);
    expect(mockStorage.presignGet).toHaveBeenCalledWith(oldFileKey, 600);
    expect(instrumentChain.eq).toHaveBeenCalledWith('org_id', 'org-1');
    expect(listChain.eq).toHaveBeenCalledWith('instrument_id', instrumentId);
    expect(listChain.eq).toHaveBeenCalledWith('instruments.org_id', 'org-1');
    expect(listChain.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
    expect(json.data).toEqual([
      expect.objectContaining({
        id: certificateId,
        path: oldFileKey,
        signedUrl: `https://presigned.example.com/${oldFileKey}`,
      }),
    ]);
  });

  it('returns 404 when the certificate object is missing', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId, serial_number: 'SN-1' },
      error: null,
    });
    const listChain = createAwaitableChain({
      data: [
        {
          id: certificateId,
          storage_path: oldFileKey,
          original_name: 'old-certificate.pdf',
          mime_type: 'application/pdf',
          size: 3,
          created_at: '2024-01-01T00:00:00Z',
          version: 1,
          is_primary: false,
          instruments: { org_id: 'org-1' },
        },
      ],
      error: null,
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') return instrumentChain;
      if (table === 'instrument_certificates') return listChain;
      throw new Error(`Unexpected table ${table}`);
    });
    mockStorage.fileExists.mockResolvedValueOnce(false);

    const response = await GET(createGetRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe('Media object not found');
    expect(mockStorage.presignGet).not.toHaveBeenCalled();
  });

  it('returns 500 when certificate access URL generation fails', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId, serial_number: 'SN-1' },
      error: null,
    });
    const listChain = createAwaitableChain({
      data: [
        {
          id: certificateId,
          storage_path: oldFileKey,
          original_name: 'old-certificate.pdf',
          mime_type: 'application/pdf',
          size: 3,
          created_at: '2024-01-01T00:00:00Z',
          version: 1,
          is_primary: false,
          instruments: { org_id: 'org-1' },
        },
      ],
      error: null,
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') return instrumentChain;
      if (table === 'instrument_certificates') return listChain;
      throw new Error(`Unexpected table ${table}`);
    });
    mockStorage.presignGet.mockRejectedValueOnce(new Error('presign failed'));

    const response = await GET(createGetRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe('Failed to generate access URL');
  });

  it('uploads a certificate without mutating false logical certificate metadata', async () => {
    const canonicalStoredKey = `tenant-b/${instrumentId}/canonical.pdf`;
    const instrumentChain = createAwaitableChain({
      data: {
        id: instrumentId,
        serial_number: 'SN-1',
        certificate: false,
        certificate_name: null,
      },
      error: null,
    });

    mockStorage.saveFile.mockResolvedValueOnce(canonicalStoredKey);
    mockStorage.getFileUrl.mockImplementation(
      (key: string) => `https://example.com/${key}`
    );

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') return instrumentChain;
      if (table === 'instrument_certificates') {
        return createAwaitableChain({ error: null });
      }
      throw new Error(`Unexpected table ${table}`);
    });
    mockAuthContext.userSupabase.rpc.mockResolvedValueOnce({
      data: certificateId,
      error: null,
    });

    const response = await POST(createPostRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.filePath).toBe(canonicalStoredKey);
    expect(mockAuthContext.userSupabase.rpc).toHaveBeenCalledWith(
      'create_instrument_certificate_metadata',
      expect.objectContaining({
        p_storage_path: canonicalStoredKey,
      })
    );
    expect(mockStorage.presignGet).toHaveBeenCalledWith(
      canonicalStoredKey,
      600
    );
    expect(instrumentChain.update).not.toHaveBeenCalled();
    expect(mockAuthContext.userSupabase.from).toHaveBeenCalledTimes(1);
  });

  it('rejects POST from a non-admin member before instrument lookup', async () => {
    mockAuthContext.role = 'member';

    const response = await POST(createPostRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.message).toBe('Admin role required');
    expect(mockAuthContext.userSupabase.from).not.toHaveBeenCalled();
    expect(mockStorage.saveFile).not.toHaveBeenCalled();
  });

  it('rejects POST without organization context', async () => {
    mockAuthContext.orgId = null;

    const response = await POST(createPostRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.message).toBe('Organization context required');
    expect(mockAuthContext.userSupabase.from).not.toHaveBeenCalled();
    expect(mockStorage.saveFile).not.toHaveBeenCalled();
  });

  it('rejects POST for an instrument outside the organization', async () => {
    const instrumentChain = createAwaitableChain({
      data: null,
      error: { message: 'Instrument not found' },
    });
    mockAuthContext.userSupabase.from.mockReturnValue(instrumentChain);

    const response = await POST(createPostRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.message).toBe('Instrument not found');
    expect(instrumentChain.eq).toHaveBeenCalledWith('org_id', 'org-1');
    expect(mockStorage.saveFile).not.toHaveBeenCalled();
  });

  it('returns 500 when POST storage upload fails without inserting metadata', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId, serial_number: 'SN-1' },
      error: null,
    });
    mockAuthContext.userSupabase.from.mockReturnValue(instrumentChain);
    mockStorage.saveFile.mockRejectedValueOnce(
      new Error('storage unavailable')
    );

    const response = await POST(createPostRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.message).toBe(
      'Failed to upload certificate: storage unavailable'
    );
    expect(mockAuthContext.userSupabase.rpc).not.toHaveBeenCalled();
    expect(mockStorage.deleteFile).not.toHaveBeenCalled();
  });

  it('rolls back POST storage when metadata insertion fails', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId, serial_number: 'SN-1' },
      error: null,
    });
    mockAuthContext.userSupabase.from.mockReturnValue(instrumentChain);
    mockStorage.saveFile.mockResolvedValueOnce('new-storage-key');
    mockAuthContext.userSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'metadata insert failed' },
    });

    const response = await POST(createPostRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.message).toBe('metadata insert failed');
    expect(mockStorage.deleteFile).toHaveBeenCalledWith('new-storage-key');
    expect(instrumentChain.update).not.toHaveBeenCalled();
  });

  it('reproduces named certificate upload and last-PDF deletion without changing logical metadata', async () => {
    const logicalMetadata = {
      certificate: true,
      certificate_name: 'Hill Certificate',
    };
    const instrumentChain = createAwaitableChain({
      data: {
        id: instrumentId,
        serial_number: 'SN-1',
        ...logicalMetadata,
      },
      error: null,
    });
    const deleteMetaChain = createAwaitableChain({
      data: { id: certificateId, storage_path: 'saved-key' },
      error: null,
    });
    const remainingChain = createAwaitableChain({
      data: [],
      error: null,
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') return instrumentChain;
      if (table === 'instrument_certificates') {
        if (deleteMetaChain.delete.mock.calls.length === 0) {
          return deleteMetaChain;
        }
        return remainingChain;
      }
      throw new Error(`Unexpected table ${table}`);
    });
    mockAuthContext.userSupabase.rpc.mockResolvedValueOnce({
      data: certificateId,
      error: null,
    });

    const uploadResponse = await POST(createPostRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const deleteResponse = await DELETE(
      {
        url: `http://localhost/api/instruments/${instrumentId}/certificates?id=${certificateId}`,
      } as unknown as NextRequest,
      { params: Promise.resolve({ id: instrumentId }) }
    );
    const deleteJson = await deleteResponse.json();

    expect(uploadResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    expect(deleteJson.result).toBe('full_success');
    expect(deleteMetaChain.delete).toHaveBeenCalledTimes(1);
    expect(mockStorage.deleteFile).toHaveBeenCalledWith('saved-key');
    expect(instrumentChain.update).not.toHaveBeenCalled();
    expect(logicalMetadata).toEqual({
      certificate: true,
      certificate_name: 'Hill Certificate',
    });
  });

  it('uploads a certificate without mutating named logical certificate metadata', async () => {
    const instrumentChain = createAwaitableChain({
      data: {
        id: instrumentId,
        serial_number: 'SN-1',
        certificate: true,
        certificate_name: 'Hill Certificate',
      },
      error: null,
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') return instrumentChain;
      throw new Error(`Unexpected table ${table}`);
    });
    mockAuthContext.userSupabase.rpc.mockResolvedValueOnce({
      data: certificateId,
      error: null,
    });

    const response = await POST(createPostRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });

    expect(response.status).toBe(200);
    expect(instrumentChain.update).not.toHaveBeenCalled();
    expect(mockAuthContext.userSupabase.from).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when replacement upload fails and leaves the old certificate intact', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId, serial_number: 'SN-1' },
      error: null,
    });
    const listChain = createAwaitableChain({
      data: [
        {
          id: certificateId,
          storage_path: oldFileKey,
          instruments: { org_id: 'org-1' },
        },
      ],
      error: null,
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return instrumentChain;
      }
      if (table === 'instrument_certificates') {
        return listChain;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    mockStorage.saveFile.mockRejectedValueOnce(new Error('upload failed'));

    const response = await PUT(createPutRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.message).toBe('Failed to replace certificate: upload failed');
    expect(mockStorage.deleteFile).not.toHaveBeenCalled();
    expect(instrumentChain.eq).toHaveBeenCalledWith('id', instrumentId);
    expect(instrumentChain.eq).toHaveBeenCalledWith('org_id', 'org-1');
    expect(listChain.eq).toHaveBeenCalledWith('instrument_id', instrumentId);
    expect(listChain.eq).toHaveBeenCalledWith('instruments.org_id', 'org-1');
  });

  it('rolls back the newly uploaded file when metadata update fails and keeps the old certificate intact', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId, serial_number: 'SN-1' },
      error: null,
    });
    const listChain = createAwaitableChain({
      data: [
        {
          id: certificateId,
          storage_path: oldFileKey,
          instruments: { org_id: 'org-1' },
        },
      ],
      error: null,
    });
    const updateChain = createAwaitableChain({
      error: { message: 'metadata update failed' },
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return instrumentChain;
      }
      if (table === 'instrument_certificates') {
        if (listChain.select.mock.calls.length === 0) {
          return listChain;
        }
        return updateChain;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await PUT(createPutRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.message).toBe('metadata update failed');
    expect(mockStorage.saveFile).toHaveBeenCalledTimes(1);
    expect(mockStorage.deleteFile).toHaveBeenCalledTimes(1);
    expect(mockStorage.deleteFile.mock.calls[0][0]).not.toBe(oldFileKey);
    expect(updateChain.update).toHaveBeenCalledTimes(1);
    expect(updateChain.eq).toHaveBeenCalledWith('instrument_id', instrumentId);
  });

  it('returns 503 when old file deletion fails after metadata commit and does not pretend success', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId, serial_number: 'SN-1' },
      error: null,
    });
    const listChain = createAwaitableChain({
      data: [
        {
          id: certificateId,
          storage_path: oldFileKey,
          instruments: { org_id: 'org-1' },
        },
      ],
      error: null,
    });
    const updateChain = createAwaitableChain({
      data: { id: certificateId, storage_path: 'saved-key' },
      error: null,
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return instrumentChain;
      }
      if (table === 'instrument_certificates') {
        if (listChain.select.mock.calls.length === 0) {
          return listChain;
        }
        return updateChain;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    mockStorage.deleteFile.mockRejectedValueOnce(new Error('delete failed'));

    const response = await PUT(createPutRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.message).toBe(
      'Failed to delete previous certificate file from storage. Please retry.'
    );
    expect(mockStorage.saveFile).toHaveBeenCalledTimes(1);
    expect(updateChain.maybeSingle).toHaveBeenCalledTimes(1);
    expect(mockStorage.deleteFile).toHaveBeenCalledWith(oldFileKey);
  });

  it('replaces certificate successfully for the correct org with scoped lookups', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId, serial_number: 'SN-1' },
      error: null,
    });
    const listChain = createAwaitableChain({
      data: [
        {
          id: certificateId,
          storage_path: oldFileKey,
          instruments: { org_id: 'org-1' },
        },
      ],
      error: null,
    });
    const updateChain = createAwaitableChain({
      data: { id: certificateId, storage_path: 'saved-key' },
      error: null,
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return instrumentChain;
      }
      if (table === 'instrument_certificates') {
        if (listChain.select.mock.calls.length === 0) {
          return listChain;
        }
        return updateChain;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await PUT(createPutRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe('Certificate replaced successfully');
    expect(json.filePath).toBe('saved-key');
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        storage_path: 'saved-key',
      })
    );
    expect(instrumentChain.eq).toHaveBeenCalledWith('org_id', 'org-1');
    expect(listChain.eq).toHaveBeenCalledWith('instruments.org_id', 'org-1');
    expect(updateChain.eq).toHaveBeenCalledWith('id', certificateId);
    expect(updateChain.eq).toHaveBeenCalledWith('instrument_id', instrumentId);
    expect(updateChain.eq).toHaveBeenCalledWith('storage_path', oldFileKey);
    expect(updateChain.select).toHaveBeenCalledWith('id, storage_path');
    expect(updateChain.maybeSingle).toHaveBeenCalledTimes(1);
    expect(mockStorage.deleteFile).toHaveBeenCalledWith(oldFileKey);
    expect(instrumentChain.update).not.toHaveBeenCalled();
  });

  it('returns 409 and rolls back new upload when replacement CAS update affects zero rows', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId, serial_number: 'SN-1' },
      error: null,
    });
    const listChain = createAwaitableChain({
      data: [
        {
          id: certificateId,
          storage_path: oldFileKey,
          instruments: { org_id: 'org-1' },
        },
      ],
      error: null,
    });
    const updateChain = createAwaitableChain({
      data: null,
      error: null,
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return instrumentChain;
      }
      if (table === 'instrument_certificates') {
        if (listChain.select.mock.calls.length === 0) {
          return listChain;
        }
        return updateChain;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await PUT(createPutRequest(), {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe(
      'Certificate changed by another request. Refresh and retry.'
    );
    expect(json.success).not.toBe(true);
    expect(mockStorage.saveFile).toHaveBeenCalledTimes(1);
    expect(mockStorage.deleteFile).toHaveBeenCalledTimes(1);
    expect(mockStorage.deleteFile).toHaveBeenCalledWith('saved-key');
    expect(mockStorage.deleteFile).not.toHaveBeenCalledWith(oldFileKey);
  });

  it('returns 200 and logs error when storage deletion fails', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId },
      error: null,
    });
    const deleteMetaChain = createAwaitableChain({
      data: { id: certificateId, storage_path: oldFileKey },
      error: null,
    });
    const remainingChain = createAwaitableChain({
      data: [{ id: 'other-cert' }],
      error: null,
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return instrumentChain;
      }
      if (table === 'instrument_certificates') {
        if (deleteMetaChain.delete.mock.calls.length === 0) {
          return deleteMetaChain;
        }
        return remainingChain;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    mockStorage.deleteFile.mockRejectedValueOnce(new Error('s3 delete failed'));

    const request = {
      url: `http://localhost/api/instruments/${instrumentId}/certificates?id=${certificateId}`,
    } as unknown as NextRequest;

    const response = await DELETE(request, {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.result).toBe('partial_success');
    expect(json.message).toBe(
      'Certificate removed from the app, but storage cleanup failed.'
    );
    expect(json.cleanup).toEqual({ storageDeleted: false });
    expect(deleteMetaChain.delete).toHaveBeenCalledTimes(1);
    expect(deleteMetaChain.select).toHaveBeenCalledWith('id, storage_path');
    expect(deleteMetaChain.maybeSingle).toHaveBeenCalledTimes(1);
    expect(instrumentChain.eq).toHaveBeenCalledWith('org_id', 'org-1');
  });

  it('deletes metadata before storage deletion', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId },
      error: null,
    });
    const deleteMetaChain = createAwaitableChain({
      data: { id: certificateId, storage_path: oldFileKey },
      error: null,
    });
    const remainingChain = createAwaitableChain({
      data: [{ id: 'other-cert' }],
      error: null,
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return instrumentChain;
      }
      if (table === 'instrument_certificates') {
        if (deleteMetaChain.delete.mock.calls.length === 0) {
          return deleteMetaChain;
        }
        return remainingChain;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const request = {
      url: `http://localhost/api/instruments/${instrumentId}/certificates?id=${certificateId}`,
    } as unknown as NextRequest;

    const response = await DELETE(request, {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.result).toBe('full_success');
    expect(json.message).toBe('Certificate deleted successfully');
    expect(json.cleanup).toEqual({ storageDeleted: true });
    expect(mockStorage.deleteFile).toHaveBeenCalledWith(oldFileKey);
    expect(deleteMetaChain.delete).toHaveBeenCalledTimes(1);
    expect(deleteMetaChain.maybeSingle).toHaveBeenCalledTimes(1);
    expect(deleteMetaChain.delete.mock.invocationCallOrder[0]).toBeLessThan(
      mockStorage.deleteFile.mock.invocationCallOrder[0]
    );
    expect(instrumentChain.eq).toHaveBeenCalledWith('org_id', 'org-1');
  });

  it('returns 500 and preserves storage when metadata deletion fails', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId },
      error: null,
    });
    const certLookupChain = createAwaitableChain({
      data: {
        id: certificateId,
        storage_path: oldFileKey,
        instruments: { org_id: 'org-1' },
      },
      error: null,
    });
    const deleteMetaChain = createAwaitableChain({
      error: { message: 'metadata delete failed' },
    });
    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') return instrumentChain;
      if (table === 'instrument_certificates') {
        if (certLookupChain.select.mock.calls.length === 0) {
          return certLookupChain;
        }
        return deleteMetaChain;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const response = await DELETE(
      {
        url: `http://localhost/api/instruments/${instrumentId}/certificates?id=${certificateId}`,
      } as unknown as NextRequest,
      { params: Promise.resolve({ id: instrumentId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.message).toBe(
      'Failed to delete certificate metadata. Please retry.'
    );
    expect(mockStorage.deleteFile).not.toHaveBeenCalled();
  });

  it('deletes the last PDF without mutating named logical certificate metadata', async () => {
    const instrumentChain = createAwaitableChain({
      data: {
        id: instrumentId,
        certificate: true,
        certificate_name: 'Hill Certificate',
      },
      error: null,
    });
    const deleteMetaChain = createAwaitableChain({
      data: { id: certificateId, storage_path: oldFileKey },
      error: null,
    });
    const remainingChain = createAwaitableChain({
      data: [],
      error: null,
    });
    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') return instrumentChain;
      if (table === 'instrument_certificates') {
        if (deleteMetaChain.delete.mock.calls.length === 0) {
          return deleteMetaChain;
        }
        return remainingChain;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const request = {
      url: `http://localhost/api/instruments/${instrumentId}/certificates?id=${certificateId}`,
    } as unknown as NextRequest;

    const response = await DELETE(request, {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.result).toBe('full_success');
    expect(mockStorage.deleteFile).toHaveBeenCalledWith(oldFileKey);
    expect(deleteMetaChain.delete).toHaveBeenCalledTimes(1);
    expect(instrumentChain.update).not.toHaveBeenCalled();
  });

  it('returns 409 when delete CAS affects zero rows and does not delete storage', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId },
      error: null,
    });
    const deleteMetaChain = createAwaitableChain({
      data: null,
      error: null,
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return instrumentChain;
      }
      if (table === 'instrument_certificates') {
        return deleteMetaChain;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const request = {
      url: `http://localhost/api/instruments/${instrumentId}/certificates?id=${certificateId}`,
    } as unknown as NextRequest;

    const response = await DELETE(request, {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toBe(
      'Certificate changed by another request. Refresh and retry.'
    );
    expect(json.result).toBeUndefined();
    expect(mockStorage.deleteFile).not.toHaveBeenCalled();
  });

  it('fails closed for wrong-org instrument before certificate delete lookup', async () => {
    const instrumentChain = createAwaitableChain({
      data: null,
      error: { message: 'Instrument not found' },
    });
    const deleteMetaChain = createAwaitableChain({
      data: null,
      error: null,
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return instrumentChain;
      }
      if (table === 'instrument_certificates') {
        return deleteMetaChain;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const request = {
      url: `http://localhost/api/instruments/${instrumentId}/certificates?id=${certificateId}`,
    } as unknown as NextRequest;

    const response = await DELETE(request, {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.message).toBe('Instrument not found');
    expect(instrumentChain.eq).toHaveBeenCalledWith('org_id', 'org-1');
    expect(deleteMetaChain.delete).not.toHaveBeenCalled();
    expect(mockStorage.deleteFile).not.toHaveBeenCalled();
  });

  it('keeps certificate=false unchanged and does not count remaining PDFs after delete', async () => {
    const instrumentChain = createAwaitableChain({
      data: {
        id: instrumentId,
        certificate: false,
        certificate_name: null,
      },
      error: null,
    });
    const deleteMetaChain = createAwaitableChain({
      data: { id: certificateId, storage_path: oldFileKey },
      error: null,
    });
    const remainingChain = createAwaitableChain({
      data: [{ id: 'other-cert' }],
      error: null,
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return instrumentChain;
      }
      if (table === 'instrument_certificates') {
        if (deleteMetaChain.delete.mock.calls.length === 0) {
          return deleteMetaChain;
        }
        return remainingChain;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const request = {
      url: `http://localhost/api/instruments/${instrumentId}/certificates?id=${certificateId}`,
    } as unknown as NextRequest;

    const response = await DELETE(request, {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.result).toBe('full_success');
    expect(json.message).toBe('Certificate deleted successfully');
    expect(json.cleanup).toEqual({ storageDeleted: true });
    expect(mockStorage.deleteFile).toHaveBeenCalledWith(oldFileKey);
    expect(instrumentChain.update).not.toHaveBeenCalled();
    expect(mockAuthContext.userSupabase.from).toHaveBeenCalledTimes(3);
    expect(remainingChain.select).not.toHaveBeenCalled();
  });

  it('returns partial_success when certificate metadata is removed but storage cleanup fails', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId },
      error: null,
    });
    const deleteMetaChain = createAwaitableChain({
      data: { id: certificateId, storage_path: oldFileKey },
      error: null,
    });
    const remainingChain = createAwaitableChain({
      data: [{ id: 'other-cert' }],
      error: null,
    });

    mockStorage.deleteFile.mockRejectedValueOnce(new Error('S3 delete failed'));

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return instrumentChain;
      }
      if (table === 'instrument_certificates') {
        if (deleteMetaChain.delete.mock.calls.length === 0) {
          return deleteMetaChain;
        }
        return remainingChain;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const request = {
      url: `http://localhost/api/instruments/${instrumentId}/certificates?id=${certificateId}`,
    } as unknown as NextRequest;

    const response = await DELETE(request, {
      params: Promise.resolve({ id: instrumentId }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.result).toBe('partial_success');
    expect(json.message).toBe(
      'Certificate removed from the app, but storage cleanup failed.'
    );
    expect(json.cleanup).toEqual({ storageDeleted: false });
    expect(deleteMetaChain.delete).toHaveBeenCalledTimes(1);
    expect(mockStorage.deleteFile).toHaveBeenCalledWith(oldFileKey);
  });

  describe('certificate mutation concurrency interleavings', () => {
    it('PUT vs PUT: losing replace returns 409 and preserves old storage', async () => {
      const instrumentChain = createAwaitableChain({
        data: { id: instrumentId, serial_number: 'SN-1' },
        error: null,
      });
      const listChain = createAwaitableChain({
        data: [
          {
            id: certificateId,
            storage_path: oldFileKey,
            instruments: { org_id: 'org-1' },
          },
        ],
        error: null,
      });
      const losingUpdateChain = createAwaitableChain({
        data: null,
        error: null,
      });

      mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
        if (table === 'instruments') return instrumentChain;
        if (table === 'instrument_certificates') {
          if (listChain.select.mock.calls.length === 0) return listChain;
          return losingUpdateChain;
        }
        throw new Error(`Unexpected table ${table}`);
      });

      const response = await PUT(createPutRequest('loser.pdf'), {
        params: Promise.resolve({ id: instrumentId }),
      });
      const json = await response.json();

      expect(response.status).toBe(409);
      expect(json.success).not.toBe(true);
      expect(mockStorage.deleteFile).toHaveBeenCalledWith('saved-key');
      expect(mockStorage.deleteFile).not.toHaveBeenCalledWith(oldFileKey);
    });

    it('PUT vs DELETE: replace loses when row is already deleted', async () => {
      const instrumentChain = createAwaitableChain({
        data: { id: instrumentId, serial_number: 'SN-1' },
        error: null,
      });
      const listChain = createAwaitableChain({
        data: [
          {
            id: certificateId,
            storage_path: oldFileKey,
            instruments: { org_id: 'org-1' },
          },
        ],
        error: null,
      });
      const updateChain = createAwaitableChain({
        data: null,
        error: null,
      });

      mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
        if (table === 'instruments') return instrumentChain;
        if (table === 'instrument_certificates') {
          if (listChain.select.mock.calls.length === 0) return listChain;
          return updateChain;
        }
        throw new Error(`Unexpected table ${table}`);
      });

      const response = await PUT(createPutRequest(), {
        params: Promise.resolve({ id: instrumentId }),
      });

      expect(response.status).toBe(409);
      expect(mockStorage.deleteFile).not.toHaveBeenCalledWith(oldFileKey);
    });

    it('DELETE vs DELETE: second delete returns 409 without storage cleanup', async () => {
      const instrumentChain = createAwaitableChain({
        data: { id: instrumentId },
        error: null,
      });
      const deleteMetaChain = createAwaitableChain({
        data: null,
        error: null,
      });

      mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
        if (table === 'instruments') return instrumentChain;
        if (table === 'instrument_certificates') return deleteMetaChain;
        throw new Error(`Unexpected table ${table}`);
      });

      const request = {
        url: `http://localhost/api/instruments/${instrumentId}/certificates?id=${certificateId}`,
      } as unknown as NextRequest;

      const response = await DELETE(request, {
        params: Promise.resolve({ id: instrumentId }),
      });

      expect(response.status).toBe(409);
      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
    });
  });
});
