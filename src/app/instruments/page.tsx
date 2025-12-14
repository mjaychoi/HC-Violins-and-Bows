'use client';

import { Instrument } from '@/types';
import dynamic from 'next/dynamic';
import {
  useUnifiedDashboard,
  useUnifiedInstruments,
} from '@/hooks/useUnifiedData';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useModalState } from '@/hooks/useModalState';
import { useLoadingState } from '@/hooks/useLoadingState';
import { AppLayout } from '@/components/layout';
import { ErrorBoundary, CardSkeleton } from '@/components/common';
import InstrumentsContent from './components/InstrumentsContent';
import { generateInstrumentSerialNumber } from '@/utils/uniqueNumberGenerator';

// Dynamic import for InstrumentForm to reduce initial bundle size
// This component uses Supabase client directly, so it's isolated from the main bundle
const InstrumentForm = dynamic(() => import('./components/InstrumentForm'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
        <CardSkeleton count={1} />
      </div>
    </div>
  ),
});

export default function InstrumentsPage() {
  // Error/Success handling
  const { handleError, showSuccess } = useAppFeedback();

  // FIXED: useUnifiedData is now called at root layout level
  // No need to call it here - data is already fetched

  // Use unified data hook (same as dashboard)
  const {
    instruments: items,
    loading,
    submitting,
    createInstrument,
  } = useUnifiedDashboard();

  const { instruments: allInstruments } = useUnifiedInstruments();

  const { isOpen: showModal, openModal, closeModal } = useModalState();
  const { withSubmitting } = useLoadingState();

  const handleSubmit = async (formData: {
    maker: string;
    name: string;
    year: string;
  }) => {
    try {
      await withSubmitting(async () => {
        // Convert form data to Instrument format
        const yearStr = formData.year?.trim();
        const yearNum = yearStr ? parseInt(yearStr, 10) : null;

        if (yearStr && isNaN(yearNum!)) {
          handleError(new Error('Invalid year value'), 'Invalid input');
          return;
        }

        // 자동으로 serial number 생성
        const existingNumbers = allInstruments
          .map(i => i.serial_number)
          .filter((num): num is string => num !== null && num !== undefined);
        const autoSerialNumber = generateInstrumentSerialNumber(
          formData.name?.trim() || null,
          existingNumbers
        );

        const instrumentData: Omit<Instrument, 'id' | 'created_at'> = {
          status: 'Available',
          maker: formData.maker?.trim() || null,
          type: formData.name?.trim() || null,
          subtype: null,
          year: yearNum,
          certificate: false,
          size: null,
          weight: null,
          price: null,
          ownership: null,
          note: null,
          serial_number: autoSerialNumber,
        };

        await createInstrument(instrumentData);
        closeModal();
        showSuccess('악기가 성공적으로 추가되었습니다.');
      });
    } catch (error) {
      handleError(error, 'Failed to create instrument');
    }
  };

  return (
    <ErrorBoundary>
      <AppLayout
        title="Instruments"
        actionButton={{
          label: 'Add New Instrument',
          onClick: openModal,
          icon: (
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          ),
        }}
      >
        <InstrumentsContent
          items={items}
          loading={loading.any}
          onAddInstrument={openModal}
        />

        {/* Instrument Form Modal */}
        <InstrumentForm
          isOpen={showModal}
          onClose={closeModal}
          onSubmit={handleSubmit}
          submitting={submitting.any}
        />
      </AppLayout>
    </ErrorBoundary>
  );
}
