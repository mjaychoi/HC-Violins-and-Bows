'use client';

import { AppLayout } from '@/components/layout';
import InvoiceSettingsPanel from '@/app/invoices/components/InvoiceSettingsPanel';
import InvoiceAccessState from '@/app/invoices/components/InvoiceAccessState';
import { usePermissions } from '@/hooks/usePermissions';

export default function InvoiceSettingsPage() {
  const {
    permissionsReady,
    canManageInvoiceSettings,
    invoiceAccessDisabledReason,
  } = usePermissions();

  if (!permissionsReady) {
    return (
      <AppLayout title="Invoice Settings">
        <div className="p-6">
          <div className="text-sm text-gray-600">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (!canManageInvoiceSettings) {
    return (
      <AppLayout title="Invoice Settings">
        <InvoiceAccessState reason={invoiceAccessDisabledReason} />
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Invoice Settings">
      <div className="p-6">
        <div className="max-w-3xl">
          <InvoiceSettingsPanel />
        </div>
      </div>
    </AppLayout>
  );
}
