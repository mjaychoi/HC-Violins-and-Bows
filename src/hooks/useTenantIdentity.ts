'use client';

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getTenantIdentityKey } from '@/utils/tenantIdentity';

export function useTenantIdentity() {
  const auth = useAuth();

  const tenantIdentityKey = useMemo(
    () =>
      getTenantIdentityKey({
        user: auth.user,
        orgId: auth.orgId,
        session: auth.session,
        loading: auth.loading,
      }),
    [auth.loading, auth.orgId, auth.session, auth.user]
  );

  return {
    tenantIdentityKey,
    isTenantTransitioning:
      auth.loading || (Boolean(auth.user) && tenantIdentityKey === null),
  };
}
