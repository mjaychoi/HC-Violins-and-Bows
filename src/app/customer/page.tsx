'use client';

// import Link from 'next/link'
import { useSidebarState } from '@/hooks/useSidebarState';
// import { useLoadingState } from '@/hooks/useLoadingState'
import { useModalState } from '@/hooks/useModalState';
import { AppLayout } from '@/components/layout';
import { ErrorBoundary } from '@/components/common';

export default function CustomerPage() {
  const {
    // isExpanded: sidebarExpanded,
    toggleSidebar,
  } = useSidebarState();

  // Modal states
  const { isOpen, openModal, closeModal } = useModalState();
  void isOpen;
  void closeModal;

  return (
    <ErrorBoundary>
      <AppLayout
        title="Customers"
        actionButton={{
          label: 'Add Customer',
          onClick: openModal,
          icon: (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          ),
        }}
      >
        {/* Header */}
        <div className="bg-white shadow-sm border-b">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center">
                <button
                  onClick={toggleSidebar}
                  className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
                >
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                </button>
                <h1 className="ml-4 text-2xl font-semibold text-gray-900">
                  Customer
                </h1>
              </div>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-center h-96">
            <h1 className="text-3xl font-bold text-gray-700">Customer</h1>
          </div>
        </div>
      </AppLayout>
    </ErrorBoundary>
  );
}
