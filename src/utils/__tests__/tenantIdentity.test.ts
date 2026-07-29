import { getAccessScopeKey, getTenantIdentityKey } from '../tenantIdentity';

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

describe('access scope key', () => {
  const base = {
    user: { id: 'user-1' },
    orgId: 'org-1',
    loading: false,
    session: {
      access_token: 'access-a',
      user: { last_sign_in_at: '2024-01-01T00:00:00Z' },
    },
  } as const;

  it('includes role and financial permission fingerprint', () => {
    const adminKey = getAccessScopeKey({ ...base, role: 'admin' } as never);
    const memberKey = getAccessScopeKey({ ...base, role: 'member' } as never);

    expect(adminKey).toBe('user-1:org-1:2024-01-01T00:00:00Z:admin:1');
    expect(memberKey).toBe('user-1:org-1:2024-01-01T00:00:00Z:member:0');
    expect(adminKey).not.toBe(memberKey);
  });

  it('changes when tenant identity changes but stays stable on access token refresh', () => {
    const first = getAccessScopeKey({
      ...base,
      role: 'admin',
      session: {
        access_token: 'access-a',
        user: { last_sign_in_at: '2024-01-01T00:00:00Z' },
      },
    } as never);

    const refreshed = getAccessScopeKey({
      ...base,
      role: 'admin',
      session: {
        access_token: 'access-b',
        user: { last_sign_in_at: '2024-01-01T00:00:00Z' },
      },
    } as never);

    const otherOrg = getAccessScopeKey({
      ...base,
      orgId: 'org-2',
      role: 'admin',
    } as never);

    expect(first).toBe(refreshed);
    expect(otherOrg).not.toBe(first);
    expect(getTenantIdentityKey(base as never)).toBe(
      'user-1:org-1:2024-01-01T00:00:00Z'
    );
  });
});
