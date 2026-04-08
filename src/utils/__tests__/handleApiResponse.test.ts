import { ApiResponseError, handleApiResponse } from '../handleApiResponse';

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
});
