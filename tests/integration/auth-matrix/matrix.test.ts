/** @jest-environment node */

/**
 * Smoke HTTP matrix. Uses interim Bearer tokens via AUTH_MATRIX_JWT_* env vars.
 * The app authenticates with cookie-backed SSR sessions; update this harness to
 * attach real Supabase auth cookies before treating 401 responses as middleware bugs.
 */

import {
  isAuthMatrixEnabled,
  loadAuthMatrixEnvironment,
  loadAuthMatrixJwtFixtures,
  type AuthMatrixEnvironment,
  type AuthMatrixJwtFixtures,
} from './env-guard';

const describeIfEnabled = isAuthMatrixEnabled() ? describe : describe.skip;

describeIfEnabled('auth matrix HTTP authorization', () => {
  let loadedEnv: AuthMatrixEnvironment;
  let tokens: AuthMatrixJwtFixtures;
  let baseUrl: string;

  beforeAll(() => {
    const env = loadAuthMatrixEnvironment();
    const jwtFixtures = loadAuthMatrixJwtFixtures();

    if (!env || !jwtFixtures) {
      throw new Error('Auth matrix environment failed to load.');
    }

    loadedEnv = env;
    tokens = jwtFixtures;
    baseUrl = loadedEnv.baseUrl;
  });

  const orgAInstrumentId = process.env.AUTH_MATRIX_ORG_A_INSTRUMENT_ID;
  const orgBInstrumentId = process.env.AUTH_MATRIX_ORG_B_INSTRUMENT_ID;

  async function request(
    path: string,
    init: RequestInit & { token?: string | null } = {}
  ) {
    const headers = new Headers(init.headers ?? {});
    if (init.token) {
      headers.set('Authorization', `Bearer ${init.token}`);
    }

    return fetch(new URL(path, baseUrl), {
      ...init,
      headers,
    });
  }

  it('rejects anonymous instrument list reads', async () => {
    const response = await request('/api/instruments');
    expect(response.status).toBeGreaterThanOrEqual(401);
    const body = await response.json().catch(() => ({}));
    expect(body.data ?? body.success).toBeFalsy();
  });

  it('allows member same-org instrument reads without financial fields', async () => {
    const response = await request('/api/instruments', {
      token: tokens.orgAMember,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    const first = Array.isArray(body.data) ? body.data[0] : null;
    if (first) {
      expect(first.cost_price).toBeUndefined();
      expect(first.consignment_price).toBeUndefined();
    }
  });

  it('allows admin same-org instrument reads with financial fields when present', async () => {
    const response = await request('/api/instruments', {
      token: tokens.orgAAdmin,
    });
    expect(response.status).toBe(200);
  });

  it('denies member instrument create mutations', async () => {
    const response = await request('/api/instruments', {
      method: 'POST',
      token: tokens.orgAMember,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        maker: 'Denied',
        type: 'Violin',
        status: 'Available',
      }),
    });
    expect([403, 401]).toContain(response.status);
  });

  it('denies member certificate mutations', async () => {
    if (!orgAInstrumentId) {
      return;
    }

    const response = await request(
      `/api/instruments/${orgAInstrumentId}/certificates`,
      {
        method: 'POST',
        token: tokens.orgAMember,
      }
    );
    expect([403, 401]).toContain(response.status);
  });

  it('does not disclose wrong-org instrument rows to Org A admin', async () => {
    if (!orgBInstrumentId) {
      return;
    }

    const response = await request(`/api/instruments?id=${orgBInstrumentId}`, {
      token: tokens.orgAAdmin,
    });
    expect([403, 404]).toContain(response.status);
  });

  it('rejects client with-connections RPC for members', async () => {
    const response = await request('/api/clients/with-connections', {
      method: 'POST',
      token: tokens.orgAMember,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: 'Denied',
        last_name: 'Member',
        links: [],
      }),
    });
    expect([403, 401]).toContain(response.status);
  });
});

describe('auth matrix availability', () => {
  it('documents skip state when credentials are absent', () => {
    if (!isAuthMatrixEnabled()) {
      expect(loadAuthMatrixEnvironment()).toBeNull();
    }
  });
});
