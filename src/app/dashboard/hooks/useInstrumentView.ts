import { useState, useCallback, useEffect } from 'react';
import { Instrument } from '@/types';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';

export function useInstrumentView() {
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedInstrument, setSelectedInstrument] =
    useState<Instrument | null>(null);
  const { tenantIdentityKey } = useTenantIdentity();

  const openInstrumentView = useCallback((instrument: Instrument) => {
    setSelectedInstrument(instrument);
    setShowViewModal(true);
  }, []);

  const closeInstrumentView = useCallback(() => {
    setShowViewModal(false);
    setSelectedInstrument(null);
  }, []);

  useEffect(() => {
    closeInstrumentView();
  }, [closeInstrumentView, tenantIdentityKey]);

  return {
    showViewModal,
    selectedInstrument,
    openInstrumentView,
    closeInstrumentView,
  };
}
