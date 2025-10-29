'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Instrument } from '@/types';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { useLoadingState } from '@/hooks/useLoadingState';
import { useModalState } from '@/hooks/useModalState';
import { AppLayout } from '@/components/layout';
import { ErrorBoundary } from '@/components/common';
import InstrumentForm from './components/InstrumentForm';
import InstrumentList from './components/InstrumentList';

export default function InstrumentsPage() {
  // Error handling
  const { ErrorToasts } = useErrorHandler();

  // Main states
  const [items, setItems] = useState<Instrument[]>([]);
  const { loading, submitting, withLoading, withSubmitting } = useLoadingState({
    initialLoading: true,
  });
  const { isOpen: showModal, openModal, closeModal } = useModalState();

  const fetchInstruments = useCallback(async () => {
    await withLoading(async () => {
      const { data, error } = await supabase
        .from('instruments')
        .select('id, maker, name, year')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setItems(
        (data || []).map(item => ({
          id: item.id,
          status: 'Available' as const,
          maker: item.maker,
          type: item.name,
          year: item.year,
          certificate: false,
          size: null,
          weight: null,
          price: null,
          ownership: null,
          note: null,
          created_at: new Date().toISOString(),
        }))
      );
    });
  }, [withLoading]);

  useEffect(() => {
    fetchInstruments();
  }, [fetchInstruments]);

  const handleSubmit = async (formData: {
    maker: string;
    name: string;
    year: string;
  }) => {
    await withSubmitting(async () => {
      const { error } = await supabase
        .from('instruments')
        .insert([
          {
            maker: formData.maker,
            name: formData.name,
            year: parseInt(formData.year),
          },
        ])
        .select();

      if (error) throw error;

      closeModal();
      await fetchInstruments();
    });
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
                loading={loading}
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
          submitting={submitting}
        />

        {/* Error Toasts */}
        <ErrorToasts />
      </AppLayout>
    </ErrorBoundary>
  );
}
