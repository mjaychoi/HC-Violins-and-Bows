import type { Session } from '@supabase/supabase-js';

const mockGetSession = jest.fn();

jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: jest.fn(async () => ({
    auth: {
      getSession: mockGetSession,
    },
  })),
}));

describe('apiFetch', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
  });

  it('adds Authorization header when session is available', async () => {
    const session = {
      access_token: 'token-123',
    } as Session;
    mockGetSession.mockResolvedValueOnce({
      data: { session },
    });

    const { apiFetch } = await import('../apiFetch');
    await apiFetch('/api/clients', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/clients', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer token-123',
      },
    });
  });

  it('fails closed when session is missing on protected requests', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
    });

    const { apiFetch, ApiFetchAuthError } = await import('../apiFetch');

    await expect(apiFetch('/api/clients')).rejects.toBeInstanceOf(
      ApiFetchAuthError
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('allows explicit public requests without a session', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
    });

    const { apiFetch } = await import('../apiFetch');
    await apiFetch('/api/health', {}, { public: true });

    expect(global.fetch).toHaveBeenCalledWith('/api/health');
  });

  it('fails closed when session lookup throws on protected requests', async () => {
    mockGetSession.mockRejectedValueOnce(new Error('session lookup failed'));

    const { apiFetch, ApiFetchAuthError } = await import('../apiFetch');

    await expect(apiFetch('/api/clients')).rejects.toBeInstanceOf(
      ApiFetchAuthError
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
