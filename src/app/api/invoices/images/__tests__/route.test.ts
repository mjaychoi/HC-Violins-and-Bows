import { NextRequest } from 'next/server';
import { POST } from '../route';
let mockUserSupabase: any;

jest.mock('@/app/api/_utils/withAuthRoute', () => {
  const actual = jest.requireActual('@/app/api/_utils/withAuthRoute');
  return {
    ...actual,
    withAuthRoute: (handler: any) => async (request: any, context?: any) =>
      handler(
        request,
        {
          user: { id: 'test-user' },
          accessToken: 'test-token',
          orgId: 'test-org',
          clientId: 'test-client',
          role: 'admin',
          userSupabase: mockUserSupabase,
          isTestBypass: true,
        },
        context
      ),
  };
});
jest.mock('@/utils/errorHandler', () => ({
  errorHandler: {
    handleSupabaseError: jest.fn(error => error),
  },
}));
jest.mock('@/utils/logger', () => ({
  logApiRequest: jest.fn(),
}));
jest.mock('@/utils/monitoring', () => ({
  captureException: jest.fn(),
}));
jest.mock('@/utils/errorSanitization', () => ({
  createSafeErrorResponse: jest.fn(error => ({
    message: error.message,
    retryable: true,
  })),
  createLogErrorInfo: jest.fn(error => ({ message: error.message })),
}));

describe('/api/invoices/images', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserSupabase = { storage: { from: jest.fn() } };
  });

  it('uploads image successfully', async () => {
    const fileContent = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01]);
    const mockFile = new File([fileContent], 'test.jpg', {
      type: 'image/jpeg',
    });
    Object.defineProperty(mockFile, 'type', {
      value: 'image/jpeg',
      writable: true,
    });
    const arrayBuffer = fileContent.buffer.slice(
      fileContent.byteOffset,
      fileContent.byteOffset + fileContent.byteLength
    );
    Object.defineProperty(mockFile, 'arrayBuffer', {
      value: jest.fn().mockResolvedValue(arrayBuffer),
      writable: true,
    });

    const mockUpload = jest.fn().mockResolvedValue({
      data: { path: 'invoice-items/test-123.jpg' },
      error: null,
    });

    const mockCreateSignedUrl = jest.fn().mockResolvedValue({
      data: { signedUrl: 'https://example.com/invoice-items/test-123.jpg' },
      error: null,
    });
    const mockExists = jest.fn().mockResolvedValue({
      data: true,
      error: null,
    });

    const mockStorage = {
      from: jest.fn(() => ({
        upload: mockUpload,
        exists: mockExists,
        createSignedUrl: mockCreateSignedUrl,
        remove: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };

    const mockTrackingQuery = {
      upsert: jest.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    };

    mockUserSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'invoice_image_uploads') return mockTrackingQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
      storage: mockStorage as any,
    };

    const formData = new FormData();
    formData.append('file', mockFile);
    const mockFormData = jest.fn().mockResolvedValue(formData);

    const request = {
      formData: mockFormData,
      url: 'http://localhost/api/invoices/images',
    } as unknown as NextRequest;

    const response = await POST(request);

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.signedUrl).toBe(
      'https://example.com/invoice-items/test-123.jpg'
    );
    expect(data.filePath).toContain('test-org/invoice-item-');
    expect(data.filePath.split('/')).toHaveLength(2);
    expect(mockUpload).toHaveBeenCalled();
    expect(mockUpload.mock.calls[0][0].split('/')).toHaveLength(2);
    expect(mockTrackingQuery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: 'test-org',
        uploaded_by_user_id: 'test-user',
        file_path: data.filePath,
      }),
      { onConflict: 'org_id,file_path' }
    );
  });

  it('rejects non-image files', async () => {
    const fileContent = Buffer.from('test content');
    const mockFile = new File([fileContent], 'test.pdf', {
      type: 'application/pdf',
    });
    Object.defineProperty(mockFile, 'type', {
      value: 'application/pdf',
      writable: true,
    });
    const arrayBuffer = fileContent.buffer.slice(
      fileContent.byteOffset,
      fileContent.byteOffset + fileContent.byteLength
    );
    Object.defineProperty(mockFile, 'arrayBuffer', {
      value: jest.fn().mockResolvedValue(arrayBuffer),
      writable: true,
    });

    const formData = new FormData();
    formData.append('file', mockFile);
    const mockFormData = jest.fn().mockResolvedValue(formData);

    const request = {
      formData: mockFormData,
      url: 'http://localhost/api/invoices/images',
    } as unknown as NextRequest;

    const response = await POST(request);

    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      message: expect.stringContaining('image'),
      retryable: false,
    });
  });

  it('rejects files larger than 10MB', async () => {
    // Create a mock file larger than 10MB
    const largeContent = new Array(11 * 1024 * 1024).fill('a').join('');
    const fileContent = Buffer.from(largeContent);
    const mockFile = new File([fileContent], 'large.jpg', {
      type: 'image/jpeg',
    });
    Object.defineProperty(mockFile, 'type', {
      value: 'image/jpeg',
      writable: true,
    });
    const arrayBuffer = fileContent.buffer.slice(
      fileContent.byteOffset,
      fileContent.byteOffset + fileContent.byteLength
    );
    Object.defineProperty(mockFile, 'arrayBuffer', {
      value: jest.fn().mockResolvedValue(arrayBuffer),
      writable: true,
    });
    Object.defineProperty(mockFile, 'size', {
      value: fileContent.length,
      writable: true,
    });

    const formData = new FormData();
    formData.append('file', mockFile);
    const mockFormData = jest.fn().mockResolvedValue(formData);

    const request = {
      formData: mockFormData,
      url: 'http://localhost/api/invoices/images',
    } as unknown as NextRequest;

    const response = await POST(request);

    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      message: expect.stringContaining('size'),
      retryable: false,
    });
  });

  it('returns error when no file is provided', async () => {
    const emptyFormData = new FormData();
    const mockFormData = jest.fn().mockResolvedValue(emptyFormData);

    const request = {
      formData: mockFormData,
      url: 'http://localhost/api/invoices/images',
    } as unknown as NextRequest;

    const response = await POST(request);

    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toMatchObject({
      message: 'No file provided',
      retryable: false,
    });
  });

  it('handles upload errors', async () => {
    const fileContent = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const mockFile = new File([fileContent], 'test.jpg', {
      type: 'image/jpeg',
    });
    Object.defineProperty(mockFile, 'type', {
      value: 'image/jpeg',
      writable: true,
    });
    const arrayBuffer = fileContent.buffer.slice(
      fileContent.byteOffset,
      fileContent.byteOffset + fileContent.byteLength
    );
    Object.defineProperty(mockFile, 'arrayBuffer', {
      value: jest.fn().mockResolvedValue(arrayBuffer),
      writable: true,
    });

    const mockUpload = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'Upload failed' },
    });

    const mockStorage = {
      from: jest.fn(() => ({
        upload: mockUpload,
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://example.com/invoice-items/test-123.jpg' },
          error: null,
        }),
        remove: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    };

    mockUserSupabase = {
      from: jest.fn(),
      storage: mockStorage as any,
    };

    const formData = new FormData();
    formData.append('file', mockFile);
    const mockFormData = jest.fn().mockResolvedValue(formData);

    const request = {
      formData: mockFormData,
      url: 'http://localhost/api/invoices/images',
    } as unknown as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(500);
  });
});
