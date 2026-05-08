import { getTenantIdentityKey } from '../tenantIdentity';

describe('tenantIdentity', () => {
  it('stays stable across access token refresh when refresh token is unchanged', () => {
    const base = {
      user: { id: 'user-1' },
      orgId: 'org-1',
      loading: false,
    };

    const first = getTenantIdentityKey({
      ...base,
      session: {
        access_token: 'access-a',
        refresh_token: 'refresh-stable',
      },
    } as never);

    const second = getTenantIdentityKey({
      ...base,
      session: {
        access_token: 'access-b',
        refresh_token: 'refresh-stable',
      },
    } as never);

    expect(first).toBe(second);
  });

  it('changes when the non-secret stable session identity changes', () => {
    const base = {
      user: { id: 'user-1' },
      orgId: 'org-1',
      loading: false,
    };

    const first = getTenantIdentityKey({
      ...base,
      session: {
        access_token: 'access-a',
        refresh_token: 'refresh-a',
        user: { last_sign_in_at: '2024-01-01T00:00:00Z' },
      },
    } as never);

    const second = getTenantIdentityKey({
      ...base,
      session: {
        access_token: 'access-b',
        refresh_token: 'refresh-b',
        user: { last_sign_in_at: '2024-01-02T00:00:00Z' },
      },
    } as never);

    expect(first).not.toBe(second);
  });

  it('does not include access or refresh token material in the identity key', () => {
    const key = getTenantIdentityKey({
      user: { id: 'user-1' },
      orgId: 'org-1',
      loading: false,
      session: {
        access_token: 'access-secret-value',
        refresh_token: 'refresh-secret-value',
        user: { last_sign_in_at: '2024-01-01T00:00:00Z' },
      },
    } as never);

    expect(key).toContain('user-1:org-1');
    expect(key).not.toContain('access-secret-value');
    expect(key).not.toContain('refresh-secret-value');
  });
});
