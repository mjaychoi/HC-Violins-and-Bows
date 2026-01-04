import { useState, useCallback } from 'react';
import { Instrument } from '@/types';

export function useInstrumentView() {
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedInstrument, setSelectedInstrument] =
    useState<Instrument | null>(null);

  const openInstrumentView = useCallback((instrument: Instrument) => {
    setSelectedInstrument(instrument);
    setShowViewModal(true);
  }, []);

  const closeInstrumentView = useCallback(() => {
    setShowViewModal(false);
    setSelectedInstrument(null);
  }, []);

  return {
    showViewModal,
    selectedInstrument,
    openInstrumentView,
    closeInstrumentView,
  };
}
