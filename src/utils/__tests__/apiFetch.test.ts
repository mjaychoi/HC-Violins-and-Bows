describe('apiFetch', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      clone() {
        return this;
      },
    } as unknown as Response);
  });

  it('uses same-origin credentials for same-origin api requests without Authorization headers', async () => {
    const { apiFetch } = await import('../apiFetch');

    await apiFetch('/api/clients', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    const requestInit = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(requestInit.method).toBe('GET');
    expect(requestInit.credentials).toBe('same-origin');

    const headers = new Headers(requestInit.headers ?? undefined);
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('Authorization')).toBeNull();
  });

  it('preserves external fetches without forcing same-origin credentials', async () => {
    const { apiFetch } = await import('../apiFetch');

    await apiFetch('https://example.com/webhook', {
      method: 'POST',
      body: JSON.stringify({ ok: true }),
    });

    const requestInit = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(requestInit.method).toBe('POST');
    expect(requestInit.credentials).toBeUndefined();
  });

  it('sets application/json Content-Type for string (JSON) bodies', async () => {
    const { apiFetch } = await import('../apiFetch');

    await apiFetch('/api/clients', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test' }),
    });

    const headers = new Headers(
      (global.fetch as jest.Mock).mock.calls[0][1]?.headers ?? undefined
    );
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('does not force application/json for FormData bodies', async () => {
    const { apiFetch } = await import('../apiFetch');
    const formData = new FormData();
    formData.append('file', new Blob(['hello']), 'hello.txt');

    await apiFetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    const headers = new Headers(
      (global.fetch as jest.Mock).mock.calls[0][1]?.headers ?? undefined
    );
    expect(headers.get('Content-Type')).toBeNull();
  });

  it('preserves caller-provided Content-Type and does not override it', async () => {
    const { apiFetch } = await import('../apiFetch');

    await apiFetch('/api/clients', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test' }),
      headers: { 'Content-Type': 'application/vnd.api+json' },
    });

    const headers = new Headers(
      (global.fetch as jest.Mock).mock.calls[0][1]?.headers ?? undefined
    );
    expect(headers.get('Content-Type')).toBe('application/vnd.api+json');
  });

  it('throws ApiFetchAuthError for same-origin api auth failures', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Valid Supabase session is required' }),
      clone() {
        return this;
      },
    } as unknown as Response);

    const { apiFetch, ApiFetchAuthError } = await import('../apiFetch');

    await expect(apiFetch('/api/clients')).rejects.toBeInstanceOf(
      ApiFetchAuthError
    );
  });

  it('throws ApiFetchNetworkError for network failures', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch'));

    const { apiFetch, ApiFetchNetworkError } = await import('../apiFetch');

    await expect(apiFetch('/api/clients')).rejects.toBeInstanceOf(
      ApiFetchNetworkError
    );
  });

  it('throws ApiFetchClientError for malformed request failures', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Failed to parse URL from :::'));

    const { apiFetch, ApiFetchClientError } = await import('../apiFetch');

    await expect(apiFetch(':::')).rejects.toBeInstanceOf(ApiFetchClientError);
  });
});
