'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/common/inputs';

interface InvoiceAccessStateProps {
  reason?: string;
}

export default function InvoiceAccessState({
  reason,
}: InvoiceAccessStateProps) {
  const router = useRouter();
  const needsOrganizationContext = reason === 'Organization context required';

  return (
    <div className="p-6">
      <div className="mx-auto max-w-lg rounded-lg border border-gray-200 bg-white px-6 py-8 text-center">
        <h2 className="text-lg font-semibold text-gray-900">
          {needsOrganizationContext
            ? 'Organization context required'
            : 'Invoices are available to administrators only.'}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          {needsOrganizationContext
            ? 'An organization context is required to open invoices.'
            : 'You can return to the dashboard to continue working.'}
        </p>
        <div className="mt-6">
          <Button variant="secondary" onClick={() => router.push('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
