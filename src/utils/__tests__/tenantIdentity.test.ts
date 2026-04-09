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

  it('changes when the stable session identity changes', () => {
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
      },
    } as never);

    const second = getTenantIdentityKey({
      ...base,
      session: {
        access_token: 'access-b',
        refresh_token: 'refresh-b',
      },
    } as never);

    expect(first).not.toBe(second);
  });
});
