import type { NextRequest } from 'next/server';
import { validateUUID } from '@/utils/inputValidation';
import { getStorage } from '@/utils/storage';
import { POST, PUT } from '../route';

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

function createUploadRequest(options: {
  method: 'POST' | 'PUT';
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  size?: number;
  putFileQuery?: string;
}) {
  const file = {
    name: options.fileName,
    type: options.mimeType,
    size: options.size ?? options.bytes.length,
    arrayBuffer: jest.fn().mockResolvedValue(options.bytes),
  };

  return {
    url:
      options.method === 'PUT'
        ? `http://localhost/api/instruments/${instrumentId}/certificates?file=${options.putFileQuery ?? 'old-certificate.pdf'}`
        : `http://localhost/api/instruments/${instrumentId}/certificates`,
    formData: jest.fn().mockResolvedValue({
      get: jest.fn().mockReturnValue(file),
    }),
  } as unknown as NextRequest;
}

function setupMinimalAdminInstrumentLookup() {
  const instrumentChain = createAwaitableChain({
    data: { id: instrumentId, serial_number: 'SN-1' },
    error: null,
  });

  mockAuthContext.userSupabase.from.mockImplementation((table: string) => {
    if (table === 'instruments') {
      return instrumentChain;
    }
    throw new Error(`Unexpected table ${table}`);
  });

  return instrumentChain;
}

function setupSuccessfulPostMocks(canonicalStoredKey = 'saved-key') {
  const instrumentChain = createAwaitableChain({
    data: { id: instrumentId, serial_number: 'SN-1' },
    error: null,
  });
  const updateInstrumentChain = createAwaitableChain({ error: null });

  mockStorage.saveFile.mockResolvedValueOnce(canonicalStoredKey);

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
}

function setupSuccessfulPutMocks() {
  const instrumentChain = createAwaitableChain({
    data: { id: instrumentId, serial_number: 'SN-1' },
    error: null,
  });
  const listChain = createAwaitableChain({
    data: [{ storage_path: oldFileKey, instruments: { org_id: 'org-1' } }],
    error: null,
  });
  const updateChain = createAwaitableChain({ error: null });

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
}

describe('/api/instruments/[id]/certificates PDF signature validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockValidateUUID.mockReturnValue(true);
    mockGetStorage.mockReturnValue(mockStorage as never);

    mockStorage.validateFile.mockReturnValue(undefined);
    mockStorage.saveFile.mockResolvedValue('saved-key');
    mockStorage.deleteFile.mockResolvedValue(true);

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

  it('accepts valid %PDF- file on POST', async () => {
    setupSuccessfulPostMocks();

    const response = await POST(
      createUploadRequest({
        method: 'POST',
        fileName: 'certificate.pdf',
        mimeType: 'application/pdf',
        bytes: Buffer.from('%PDF-1.4 valid content'),
      }),
      { params: Promise.resolve({ id: instrumentId }) }
    );

    expect(response.status).toBe(200);
    expect(mockStorage.saveFile).toHaveBeenCalledTimes(1);
    expect(mockAuthContext.userSupabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('accepts valid PDF on PUT', async () => {
    setupSuccessfulPutMocks();

    const response = await PUT(
      createUploadRequest({
        method: 'PUT',
        fileName: 'replacement.pdf',
        mimeType: 'application/pdf',
        bytes: Buffer.from('%PDF-1.4 replacement'),
      }),
      { params: Promise.resolve({ id: instrumentId }) }
    );

    expect(response.status).toBe(200);
    expect(mockStorage.saveFile).toHaveBeenCalledTimes(1);
  });

  it('rejects .pdf name + application/pdf with non-PDF bytes', async () => {
    setupMinimalAdminInstrumentLookup();

    const response = await POST(
      createUploadRequest({
        method: 'POST',
        fileName: 'certificate.pdf',
        mimeType: 'application/pdf',
        bytes: Buffer.from('not-a-pdf'),
      }),
      { params: Promise.resolve({ id: instrumentId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.message).toBe('Invalid certificate file');
    expect(mockStorage.saveFile).not.toHaveBeenCalled();
    expect(mockAuthContext.userSupabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects empty .pdf upload', async () => {
    setupMinimalAdminInstrumentLookup();
    const response = await POST(
      createUploadRequest({
        method: 'POST',
        fileName: 'certificate.pdf',
        mimeType: 'application/pdf',
        bytes: Buffer.alloc(0),
        size: 0,
      }),
      { params: Promise.resolve({ id: instrumentId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.message).toBe('Certificate file is empty');
    expect(mockStorage.saveFile).not.toHaveBeenCalled();
    expect(mockAuthContext.userSupabase.rpc).not.toHaveBeenCalled();
  });

  it('allows application/pdf MIME without .pdf extension when magic bytes match', async () => {
    setupSuccessfulPostMocks();

    const response = await POST(
      createUploadRequest({
        method: 'POST',
        fileName: 'certificate',
        mimeType: 'application/pdf',
        bytes: Buffer.from('%PDF-1.4 no extension'),
      }),
      { params: Promise.resolve({ id: instrumentId }) }
    );

    expect(response.status).toBe(200);
    expect(mockStorage.saveFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.any(String),
      'application/pdf'
    );
  });

  it('rejects truncated PDF header', async () => {
    setupMinimalAdminInstrumentLookup();

    const response = await POST(
      createUploadRequest({
        method: 'POST',
        fileName: 'certificate.pdf',
        mimeType: 'application/pdf',
        bytes: Buffer.from('%PD'),
        size: 3,
      }),
      { params: Promise.resolve({ id: instrumentId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.message).toBe('Invalid certificate file');
    expect(mockStorage.saveFile).not.toHaveBeenCalled();
    expect(mockAuthContext.userSupabase.rpc).not.toHaveBeenCalled();
  });

  it('does not call saveFile, metadata RPC, or instrument update when POST validation fails', async () => {
    const instrumentChain = setupMinimalAdminInstrumentLookup();

    const response = await POST(
      createUploadRequest({
        method: 'POST',
        fileName: 'certificate.pdf',
        mimeType: 'application/pdf',
        bytes: Buffer.from('fake pdf content'),
      }),
      { params: Promise.resolve({ id: instrumentId }) }
    );

    expect(response.status).toBe(400);
    expect(mockStorage.saveFile).not.toHaveBeenCalled();
    expect(mockAuthContext.userSupabase.rpc).not.toHaveBeenCalled();
    expect(instrumentChain.update).not.toHaveBeenCalled();
  });

  it('does not call saveFile or metadata update when PUT validation fails', async () => {
    setupSuccessfulPutMocks();

    const response = await PUT(
      createUploadRequest({
        method: 'PUT',
        fileName: 'replacement.pdf',
        mimeType: 'application/pdf',
        bytes: Buffer.from('fake pdf content'),
      }),
      { params: Promise.resolve({ id: instrumentId }) }
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.message).toBe('Invalid certificate file');
    expect(mockStorage.saveFile).not.toHaveBeenCalled();
  });

  it('applies the same validation policy to POST and PUT for spoofed uploads', async () => {
    setupMinimalAdminInstrumentLookup();

    const postResponse = await POST(
      createUploadRequest({
        method: 'POST',
        fileName: 'certificate.pdf',
        mimeType: 'application/pdf',
        bytes: Buffer.from('html<script>'),
      }),
      { params: Promise.resolve({ id: instrumentId }) }
    );

    setupSuccessfulPutMocks();

    const putResponse = await PUT(
      createUploadRequest({
        method: 'PUT',
        fileName: 'replacement.pdf',
        mimeType: 'application/pdf',
        bytes: Buffer.from('html<script>'),
      }),
      { params: Promise.resolve({ id: instrumentId }) }
    );

    expect(postResponse.status).toBe(400);
    expect(putResponse.status).toBe(400);
    expect(await postResponse.json()).toEqual(
      expect.objectContaining({ message: 'Invalid certificate file' })
    );
    expect(await putResponse.json()).toEqual(
      expect.objectContaining({ message: 'Invalid certificate file' })
    );
  });
});
