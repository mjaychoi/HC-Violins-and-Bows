import { downloadCertificatePdf } from '../certificateDownload';
import { apiFetch } from '@/utils/apiFetch';

jest.mock('@/utils/apiFetch', () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('downloadCertificatePdf', () => {
  const showSuccess = jest.fn();
  const handleError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.URL.createObjectURL = jest.fn(() => 'blob:test');
    global.URL.revokeObjectURL = jest.fn();
  });

  it('downloads only after validating response, content type, and blob size', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      statusText: 'OK',
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-type' ? 'application/pdf' : null,
      },
      blob: async () => new Blob(['pdf'], { type: 'application/pdf' }),
    } as Response);

    const result = await downloadCertificatePdf({
      url: '/api/certificates/test',
      downloadFileName: 'certificate.pdf',
      errorContext: 'CertificateDownload',
      showSuccess,
      handleError,
    });

    expect(result).toBe(true);
    expect(showSuccess).toHaveBeenCalledWith(
      'Certificate downloaded successfully'
    );
    expect(handleError).not.toHaveBeenCalled();
  });

  it('fails closed on invalid content type', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      statusText: 'OK',
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-type' ? 'application/json' : null,
      },
      blob: async () => new Blob(['{}'], { type: 'application/json' }),
    } as Response);

    const result = await downloadCertificatePdf({
      url: '/api/certificates/test',
      downloadFileName: 'certificate.pdf',
      errorContext: 'CertificateDownload',
      showSuccess,
      handleError,
    });

    expect(result).toBe(false);
    expect(showSuccess).not.toHaveBeenCalled();
    expect(handleError).toHaveBeenCalledWith(
      expect.any(Error),
      'CertificateDownload'
    );
  });

  it('fails closed on empty blob', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      statusText: 'OK',
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-type' ? 'application/pdf' : null,
      },
      blob: async () => new Blob([], { type: 'application/pdf' }),
    } as Response);

    const result = await downloadCertificatePdf({
      url: '/api/certificates/test',
      downloadFileName: 'certificate.pdf',
      errorContext: 'CertificateDownload',
      showSuccess,
      handleError,
    });

    expect(result).toBe(false);
    expect(showSuccess).not.toHaveBeenCalled();
    expect(handleError).toHaveBeenCalledWith(
      expect.any(Error),
      'CertificateDownload'
    );
  });
});
