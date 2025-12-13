import { useState, useMemo, useCallback } from 'react';
import { Instrument } from '@/types';
import { useUnifiedInstruments } from '@/hooks/useUnifiedData';

export function useInstrumentSearch() {
  const [showInstrumentSearch, setShowInstrumentSearch] = useState(false);
  const [instrumentSearchTerm, setInstrumentSearchTerm] = useState('');

  const { instruments } = useUnifiedInstruments();

  // Client-side search using useMemo for performance
  const searchResults = useMemo<Instrument[]>(() => {
    if (instrumentSearchTerm.length < 2) {
      return [];
    }

    const searchLower = instrumentSearchTerm.toLowerCase();
    return instruments.filter(
      instrument =>
        (instrument.maker || '').toLowerCase().includes(searchLower) ||
        (instrument.type || '').toLowerCase().includes(searchLower) ||
        (instrument.subtype || '').toLowerCase().includes(searchLower) ||
        (instrument.serial_number || '').toLowerCase().includes(searchLower)
    );
  }, [instruments, instrumentSearchTerm]);

  const openInstrumentSearch = useCallback(() => {
    setShowInstrumentSearch(true);
  }, []);

  const closeInstrumentSearch = useCallback(() => {
    setShowInstrumentSearch(false);
    setInstrumentSearchTerm('');
  }, []);

  const handleInstrumentSearch = useCallback((term: string) => {
    setInstrumentSearchTerm(term);
  }, []);

  return {
    showInstrumentSearch,
    instrumentSearchTerm,
    searchResults,
    isSearchingInstruments: false, // No longer async, so always false
    openInstrumentSearch,
    closeInstrumentSearch,
    handleInstrumentSearch,
  };
}
