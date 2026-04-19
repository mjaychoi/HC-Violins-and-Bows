import {
  ApiResponseError,
  createApiResponseErrorFromResponse,
  handleApiResponse,
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
});
