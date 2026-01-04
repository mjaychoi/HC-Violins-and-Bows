'use client';

import { AppLayout } from '@/components/layout';
import InvoiceSettingsPanel from '@/app/invoices/components/InvoiceSettingsPanel';

export default function InvoiceSettingsPage() {
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
