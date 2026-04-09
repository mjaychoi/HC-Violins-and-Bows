import type { NextRequest } from 'next/server';
import { validateUUID } from '@/utils/inputValidation';
import { getStorage } from '@/utils/storage';
import { POST, PUT, DELETE } from '../route';

const mockStorage = {
  validateFile: jest.fn(),
  saveFile: jest.fn(),
  deleteFile: jest.fn(),
  presignPut: jest.fn(),
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
    arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('pdf')),
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
    arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  };

  return {
    url: `http://localhost/api/instruments/${instrumentId}/certificates`,
    formData: jest.fn().mockResolvedValue({
      get: jest.fn().mockReturnValue(certificateFile),
    }),
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
    mockStorage.presignPut.mockResolvedValue('https://example.com/signed');

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

  it('persists the canonical stored key returned by storage during certificate upload', async () => {
    const canonicalStoredKey = `tenant-b/${instrumentId}/canonical.pdf`;
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId, serial_number: 'SN-1' },
      error: null,
    });
    const updateInstrumentChain = createAwaitableChain({ error: null });

    mockStorage.saveFile.mockResolvedValueOnce(canonicalStoredKey);
    mockStorage.getFileUrl.mockImplementation(
      (key: string) => `https://example.com/${key}`
    );

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        if (instrumentChain.select.mock.calls.length === 0) {
          return instrumentChain;
        }
        return updateInstrumentChain;
      }
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
    expect(mockStorage.getFileUrl).toHaveBeenCalledWith(canonicalStoredKey);
  });

  it('returns 500 when replacement upload fails and leaves the old certificate intact', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId, serial_number: 'SN-1' },
      error: null,
    });
    const listChain = createAwaitableChain({
      data: [{ storage_path: oldFileKey, instruments: { org_id: 'org-1' } }],
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
      data: [{ storage_path: oldFileKey, instruments: { org_id: 'org-1' } }],
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
      data: [{ storage_path: oldFileKey, instruments: { org_id: 'org-1' } }],
      error: null,
    });
    const updateChain = createAwaitableChain({
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
    expect(updateChain.then).toHaveBeenCalledTimes(1);
    expect(mockStorage.deleteFile).toHaveBeenCalledWith(oldFileKey);
  });

  it('replaces certificate successfully for the correct org with scoped lookups', async () => {
    const instrumentChain = createAwaitableChain({
      data: { id: instrumentId, serial_number: 'SN-1' },
      error: null,
    });
    const listChain = createAwaitableChain({
      data: [{ storage_path: oldFileKey, instruments: { org_id: 'org-1' } }],
      error: null,
    });
    const updateChain = createAwaitableChain({
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
    expect(updateChain.eq).toHaveBeenCalledWith('instrument_id', instrumentId);
    expect(mockStorage.deleteFile).toHaveBeenCalledWith(oldFileKey);
  });

  it('returns 200 and logs error when storage deletion fails', async () => {
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
        if (certLookupChain.select.mock.calls.length === 0) {
          return certLookupChain;
        }
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
    expect(instrumentChain.eq).toHaveBeenCalledWith('org_id', 'org-1');
    expect(certLookupChain.eq).toHaveBeenCalledWith(
      'instruments.org_id',
      'org-1'
    );
  });

  it('deletes metadata before storage deletion', async () => {
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
        if (certLookupChain.select.mock.calls.length === 0) {
          return certLookupChain;
        }
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
    expect(deleteMetaChain.then).toHaveBeenCalledTimes(1);
    expect(deleteMetaChain.delete.mock.invocationCallOrder[0]).toBeLessThan(
      mockStorage.deleteFile.mock.invocationCallOrder[0]
    );
    expect(instrumentChain.eq).toHaveBeenCalledWith('org_id', 'org-1');
    expect(certLookupChain.eq).toHaveBeenCalledWith(
      'instruments.org_id',
      'org-1'
    );
  });

  it('returns 500 when the final instrument certificate flag update fails and does not pretend success', async () => {
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
      error: null,
    });
    const remainingChain = createAwaitableChain({
      data: [],
      error: null,
    });
    const updateInstrumentChain = createAwaitableChain({
      error: { message: 'instrument flag update failed' },
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        if (instrumentChain.select.mock.calls.length === 0) {
          return instrumentChain;
        }
        return updateInstrumentChain;
      }
      if (table === 'instrument_certificates') {
        if (certLookupChain.select.mock.calls.length === 0) {
          return certLookupChain;
        }
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

    expect(response.status).toBe(500);
    expect(json.message).toBe(
      'Certificate file and metadata were deleted, but the instrument certificate flag update failed. Please retry or reconcile the instrument state.'
    );
    expect(mockStorage.deleteFile).toHaveBeenCalledWith(oldFileKey);
    expect(deleteMetaChain.delete).toHaveBeenCalledTimes(1);
    expect(updateInstrumentChain.update).toHaveBeenCalledWith({
      certificate: false,
    });
    expect(updateInstrumentChain.eq).toHaveBeenCalledWith('id', instrumentId);
    expect(updateInstrumentChain.eq).toHaveBeenCalledWith('org_id', 'org-1');
  });

  it('fails closed for wrong-org instrument before certificate delete lookup', async () => {
    const instrumentChain = createAwaitableChain({
      data: null,
      error: { message: 'Instrument not found' },
    });
    const certLookupChain = createAwaitableChain({
      data: null,
      error: null,
    });

    mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
      if (table === 'instruments') {
        return instrumentChain;
      }
      if (table === 'instrument_certificates') {
        return certLookupChain;
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
    expect(certLookupChain.select).not.toHaveBeenCalled();
    expect(mockStorage.deleteFile).not.toHaveBeenCalled();
  });

  it('returns full_success when certificate metadata and storage delete both succeed', async () => {
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
        if (certLookupChain.select.mock.calls.length === 0) {
          return certLookupChain;
        }
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
  });

  it('returns partial_success when certificate metadata is removed but storage cleanup fails', async () => {
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
        if (certLookupChain.select.mock.calls.length === 0) {
          return certLookupChain;
        }
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
});
