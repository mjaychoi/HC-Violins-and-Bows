'use client';

import { useMemo } from 'react';
import { useOptionalAuth } from '@/contexts/AuthContext';

export function usePermissions() {
  const { user, loading, role, hasOrgContext } = useOptionalAuth();

  return useMemo(() => {
    const isReady = !loading && Boolean(user);
    const canUseOrgScopedFeatures = isReady && hasOrgContext;
    const canUseAdminOrgFeatures = canUseOrgScopedFeatures && role === 'admin';

    return {
      canCreateSale: canUseOrgScopedFeatures,
      canCreateInvoice: canUseOrgScopedFeatures,
      canCreateInstrument: canUseOrgScopedFeatures,
      canCreateTask: canUseOrgScopedFeatures,
      canCreateContactLog: canUseOrgScopedFeatures,
      canCreateNote: isReady,
      canCreateConnection: canUseAdminOrgFeatures,
      canManageContactLogs: canUseAdminOrgFeatures,
      canManageTasks: canUseAdminOrgFeatures,
      canManageSales: canUseAdminOrgFeatures,
      canEditInvoice: canUseAdminOrgFeatures,
      canDeleteInvoice: canUseAdminOrgFeatures,
      canManageInvoiceSettings: canUseAdminOrgFeatures,
      canDeleteConnection: canUseAdminOrgFeatures,
      canManageConnections: canUseAdminOrgFeatures,
      canManageInstruments: canUseAdminOrgFeatures,
      canUploadInstrumentMedia: canUseAdminOrgFeatures,
      canManageClients: canUseAdminOrgFeatures,
      canCreateClient: canUseOrgScopedFeatures,
    };
  }, [loading, user, role, hasOrgContext]);
}

export type Permissions = ReturnType<typeof usePermissions>;

export default usePermissions;
