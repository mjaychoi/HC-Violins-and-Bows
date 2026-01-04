import { NextRequest } from 'next/server';
import { POST } from '../route';
import { getSupabaseClient } from '@/lib/supabase-client';

jest.mock('@/lib/supabase-client');
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
  createSafeErrorResponse: jest.fn(error => ({ error: error.message })),
  createLogErrorInfo: jest.fn(error => ({ message: error.message })),
}));

const mockGetSupabaseClient = getSupabaseClient as jest.MockedFunction<
  typeof getSupabaseClient
>;

describe('/api/invoices/images', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    const mockGetPublicUrl = jest.fn().mockReturnValue({
      data: { publicUrl: 'https://example.com/invoice-items/test-123.jpg' },
    });

    const mockStorage = {
      from: jest.fn(() => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      })),
    };

    mockGetSupabaseClient.mockResolvedValue({
      storage: mockStorage as any,
    } as any);

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
    expect(data.success).toBe(true);
    expect(data.publicUrl).toBe(
      'https://example.com/invoice-items/test-123.jpg'
    );
    expect(mockUpload).toHaveBeenCalled();
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
    expect(data.error).toContain('image');
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
    expect(data.error).toContain('size');
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
    expect(data.error).toContain('No file provided');
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
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: '' } }),
      })),
    };

    mockGetSupabaseClient.mockResolvedValue({
      storage: mockStorage as any,
    } as any);

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
