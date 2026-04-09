import { getSupabaseClient } from '@/lib/supabase-client';

export class ApiFetchAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiFetchAuthError';
  }
}

type ApiFetchOptions = {
  public?: boolean;
  idempotencyKey?: string;
};

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: ApiFetchOptions
): Promise<Response> {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  const isPublic = options?.public === true || url.startsWith('/api/health');

  if (isPublic) {
    if (!init || Object.keys(init).length === 0) {
      return fetch(input);
    }
    return fetch(input, init);
  }

  try {
    const client = await getSupabaseClient();
    const { data, error } = await client.auth.getSession();

    if (error) {
      throw new ApiFetchAuthError('Session lookup failed');
    }

    if (!data?.session) {
      throw new ApiFetchAuthError('Missing session');
    }

    return fetch(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session.access_token}`,
        ...(options?.idempotencyKey
          ? { 'Idempotency-Key': options.idempotencyKey }
          : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof ApiFetchAuthError) {
      throw error;
    }
    throw new ApiFetchAuthError('Session lookup failed');
  }
}
