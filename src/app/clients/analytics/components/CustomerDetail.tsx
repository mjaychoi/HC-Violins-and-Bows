import { CustomerWithPurchases } from '../types';

export function CustomerDetail({
  customer,
}: {
  customer: CustomerWithPurchases | null;
}) {
  // ✅ Tags are already normalized in useCustomers
  const tags = customer?.tags || [];
  if (!customer) {
    return (
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-16 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
            <svg
              className="h-6 w-6 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">
            Select a customer to view details
          </p>
          <p className="text-xs text-gray-500">
            Choose a customer from the list to see their information
          </p>
        </div>
      </div>
    );
  }

  const fullName =
    `${customer.first_name || ''} ${customer.last_name || ''}`.trim() ||
    'Unnamed';
  const email = customer.email?.trim();
  const contactNumber = customer.contact_number?.trim();
  const clientNumber = customer.client_number?.trim();
  const interest = customer.interest?.trim();

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">{fullName}</h3>
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <svg
                  className="h-4 w-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <span className={email ? '' : 'text-gray-400'}>
                  {email || 'No email'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <svg
                  className="h-4 w-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
                <span className={contactNumber ? '' : 'text-gray-400'}>
                  {contactNumber || 'No contact'}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right ml-4">
            <div className="text-xs text-gray-500 mb-1">Client #</div>
            <div className="font-mono text-sm text-gray-900 mb-3">
              {clientNumber || 'N/A'}
            </div>
            <div className="text-xs font-medium text-gray-600">
              {`Interest: ${interest || 'N/A'}`}
            </div>
          </div>
        </div>
      </div>
      <div className="px-6 py-4 space-y-4">
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Tags
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.length > 0 ? (
              // FIXED: Add index to key to prevent collisions if tags repeat
              tags.map((tag: string, i: number) => (
                <span
                  key={`${tag}-${i}`}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                >
                  {tag}
                </span>
              ))
            ) : (
              <span className="text-sm text-gray-400">No tags</span>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Note
          </div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap">
            {customer.note || '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
