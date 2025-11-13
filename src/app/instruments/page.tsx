'use client';

import { Instrument } from '@/types';
import {
  useUnifiedDashboard,
  useUnifiedInstruments,
} from '@/hooks/useUnifiedData';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { useModalState } from '@/hooks/useModalState';
import { useLoadingState } from '@/hooks/useLoadingState';
import { AppLayout } from '@/components/layout';
import { ErrorBoundary } from '@/components/common';
import InstrumentForm from './components/InstrumentForm';
import InstrumentList from './components/InstrumentList';
import { generateInstrumentSerialNumber } from '@/utils/uniqueNumberGenerator';

export default function InstrumentsPage() {
  // Error handling
  const { ErrorToasts, handleError } = useErrorHandler();

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
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          ),
        }}
      >
        <div className="p-6">
          {/* Instruments List */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                All Instruments
              </h3>

              <InstrumentList
                items={items}
                loading={loading.any}
                onAddInstrument={openModal}
              />
            </div>
          </div>
        </div>

        {/* Instrument Form Modal */}
        <InstrumentForm
          isOpen={showModal}
          onClose={closeModal}
          onSubmit={handleSubmit}
          submitting={submitting.any}
        />

        {/* Error Toasts */}
        <ErrorToasts />
      </AppLayout>
    </ErrorBoundary>
  );
}
