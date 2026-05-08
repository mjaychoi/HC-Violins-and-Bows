'use client';

import { useMemo } from 'react';
import { useOptionalAuth } from '@/contexts/AuthContext';

export function usePermissions() {
  const { user, loading, role, hasOrgContext } = useOptionalAuth();

  return useMemo(() => {
    const isReady = !loading && Boolean(user);
    const canUseOrgScopedFeatures = isReady && hasOrgContext;
    const canUseAdminOrgFeatures = canUseOrgScopedFeatures && role === 'admin';

    const orgScopedReason = !isReady
      ? 'Checking permissions'
      : !hasOrgContext
        ? 'Organization context required'
        : undefined;

    const adminOnlyReason = !isReady
      ? 'Checking permissions'
      : !hasOrgContext
        ? 'Organization context required'
        : role !== 'admin'
          ? 'Admin only'
          : undefined;

    return {
      canCreateSale: canUseAdminOrgFeatures,
      canCreateInvoice: canUseAdminOrgFeatures,
      canCreateInstrument: canUseAdminOrgFeatures,
      canCreateTask: canUseAdminOrgFeatures,
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
      canCreateClient: canUseAdminOrgFeatures,

      createClientDisabledReason: canUseAdminOrgFeatures
        ? undefined
        : adminOnlyReason,

      createInvoiceDisabledReason: canUseAdminOrgFeatures
        ? undefined
        : adminOnlyReason,

      createTaskDisabledReason: canUseAdminOrgFeatures
        ? undefined
        : adminOnlyReason,

      createInstrumentDisabledReason: canUseAdminOrgFeatures
        ? undefined
        : adminOnlyReason,

      createSaleDisabledReason: canUseAdminOrgFeatures
        ? undefined
        : adminOnlyReason,

      exportSalesDisabledReason: canUseAdminOrgFeatures
        ? undefined
        : adminOnlyReason,

      createContactLogDisabledReason: canUseOrgScopedFeatures
        ? undefined
        : orgScopedReason,

      createNoteDisabledReason: isReady ? undefined : 'Checking permissions',
    };
  }, [loading, user, role, hasOrgContext]);
}

export type Permissions = ReturnType<typeof usePermissions>;

export default usePermissions;
