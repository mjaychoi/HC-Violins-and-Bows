'use client';

import { useMemo } from 'react';
import { useOptionalAuth } from '@/contexts/AuthContext';

export function usePermissions() {
  const { user, loading, role, hasOrgContext } = useOptionalAuth();

  return useMemo(() => {
    const isReady = !loading && Boolean(user);
    const canUseOrgScopedFeatures = isReady && hasOrgContext;
    const canUseAdminOrgFeatures = canUseOrgScopedFeatures && role === 'admin';
    const adminOnlyReason = !isReady
      ? 'Checking permissions'
      : !hasOrgContext
        ? 'Organization context required'
        : role !== 'admin'
          ? 'Admin only'
          : undefined;

    return {
      canCreateSale: canUseAdminOrgFeatures,
      canCreateInvoice: canUseOrgScopedFeatures,
      canCreateInstrument: canUseOrgScopedFeatures,
      canCreateTask: canUseOrgScopedFeatures,
      canCreateContactLog: canUseOrgScopedFeatures,
      canCreateNote: isReady,
      canCreateConnection: canUseAdminOrgFeatures,
      canManageContactLogs: canUseAdminOrgFeatures,
      canManageTasks: canUseAdminOrgFeatures,
      canManageSales: canUseAdminOrgFeatures,
      canExportSales: canUseAdminOrgFeatures,
      canEditInvoice: canUseAdminOrgFeatures,
      canDeleteInvoice: canUseAdminOrgFeatures,
      canManageInvoiceSettings: canUseAdminOrgFeatures,
      canDeleteConnection: canUseAdminOrgFeatures,
      canManageConnections: canUseAdminOrgFeatures,
      canManageInstruments: canUseAdminOrgFeatures,
      canUploadInstrumentMedia: canUseAdminOrgFeatures,
      canManageClients: canUseAdminOrgFeatures,
      canCreateClient: canUseOrgScopedFeatures,
      createSaleDisabledReason:
        canUseAdminOrgFeatures || !canUseOrgScopedFeatures
          ? undefined
          : adminOnlyReason,
      exportSalesDisabledReason:
        canUseAdminOrgFeatures || !canUseOrgScopedFeatures
          ? undefined
          : adminOnlyReason,
    };
  }, [loading, user, role, hasOrgContext]);
}

export type Permissions = ReturnType<typeof usePermissions>;

export default usePermissions;
