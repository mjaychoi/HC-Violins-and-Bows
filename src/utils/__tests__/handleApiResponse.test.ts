import {
  ApiResponseError,
  createApiResponseErrorFromResponse,
  handleApiResponse,
  readApiResponseEnvelope,
} from '../handleApiResponse';

describe('handleApiResponse', () => {
  it('returns data when response is ok', async () => {
    const response = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ data: { id: 'task-1' } }),
    } as unknown as Response;

    await expect(
      handleApiResponse<{ id: string }>(response, 'fallback')
    ).resolves.toEqual({ id: 'task-1' });
  });

  it('throws structured ApiResponseError for backend envelope', async () => {
    const response = {
      ok: false,
      status: 403,
      json: jest.fn().mockResolvedValue({
        message: 'Admin role required',
        error_code: 'ADMIN_REQUIRED',
        retryable: false,
        details: { scope: 'sales' },
      }),
    } as unknown as Response;

    await expect(handleApiResponse(response, 'fallback')).rejects.toMatchObject<
      Partial<ApiResponseError>
    >({
      name: 'ApiResponseError',
      message: 'Admin role required',
      error_code: 'ADMIN_REQUIRED',
      retryable: false,
      details: { scope: 'sales' },
      status: 403,
    });
  });

  it('uses a server-specific fallback message for 500 responses without a body message', async () => {
    const response = {
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({}),
    } as unknown as Response;

    await expect(
      handleApiResponse(response, 'Failed to fetch maintenance tasks (500)')
    ).rejects.toMatchObject<Partial<ApiResponseError>>({
      name: 'ApiResponseError',
      message: 'Server error occurred. Please try again later.',
      status: 500,
    });
  });

  it('parses plain-text error responses into ApiResponseError messages', async () => {
    const response = {
      ok: false,
      status: 502,
      clone: jest.fn().mockReturnValue({
        json: jest.fn().mockRejectedValue(new Error('not json')),
      }),
      text: jest.fn().mockResolvedValue('Upstream gateway failed'),
    } as unknown as Response;

    await expect(
      createApiResponseErrorFromResponse(response, 'fallback')
    ).resolves.toMatchObject<Partial<ApiResponseError>>({
      name: 'ApiResponseError',
      message: 'Upstream gateway failed',
      status: 502,
    });
  });

  it('replaces HTML error pages with a short message', async () => {
    const html = `<!DOCTYPE html><html><head><title>500</title></head><body>err</body></html>`;
    const response = {
      ok: false,
      status: 500,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      clone: jest.fn().mockReturnValue({
        json: jest.fn().mockRejectedValue(new Error('not json')),
      }),
      text: jest.fn().mockResolvedValue(html),
    } as unknown as Response;

    await expect(
      handleApiResponse(response, 'Failed to fetch maintenance tasks (500)')
    ).rejects.toMatchObject<Partial<ApiResponseError>>({
      name: 'ApiResponseError',
      message: 'The server returned an unexpected response. Please try again.',
      status: 500,
    });
  });

  it('rejects successful responses that are missing the data envelope', async () => {
    const response = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ count: 0 }),
    } as unknown as Response;

    await expect(
      readApiResponseEnvelope<unknown[]>(response, 'fallback')
    ).rejects.toMatchObject<Partial<ApiResponseError>>({
      name: 'ApiResponseError',
      message: 'The server returned an unexpected response. Please try again.',
      error_code: 'INVALID_RESPONSE',
      status: 502,
    });
  });

  it('rejects successful HTML responses instead of returning null', async () => {
    const html = '<!DOCTYPE html><html><body>redirect</body></html>';
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      clone: jest.fn().mockReturnValue({
        json: jest.fn().mockRejectedValue(new Error('not json')),
      }),
      text: jest.fn().mockResolvedValue(html),
    } as unknown as Response;

    await expect(handleApiResponse(response, 'fallback')).rejects.toMatchObject<
      Partial<ApiResponseError>
    >({
      name: 'ApiResponseError',
      message: 'The server returned an unexpected response. Please try again.',
      error_code: 'INVALID_RESPONSE',
      status: 502,
    });
  });

  it('throws when ok response has data: null (default contract)', async () => {
    const response = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ data: null }),
    } as unknown as Response;

    await expect(
      handleApiResponse<{ id: string }>(response, 'fallback')
    ).rejects.toMatchObject<Partial<ApiResponseError>>({
      name: 'ApiResponseError',
      message: 'The server response did not include the expected data.',
    });
  });

  it('throws when ok response is success: true with no data payload (default contract)', async () => {
    const response = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ success: true }),
    } as unknown as Response;

    await expect(handleApiResponse(response, 'fallback')).rejects.toMatchObject<
      Partial<ApiResponseError>
    >({
      name: 'ApiResponseError',
      message: 'The server returned success without a data payload.',
    });
  });

  it('allows success without data when allowSuccessWithoutData is true (e.g. DELETE)', async () => {
    const response = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ success: true }),
    } as unknown as Response;

    await expect(
      handleApiResponse<null>(response, 'fallback', {
        allowSuccessWithoutData: true,
      })
    ).resolves.toBeNull();
  });
});
