import { useState, useMemo, useCallback, useDeferredValue } from 'react';
import { Instrument } from '@/types';
import { useUnifiedInstruments } from '@/hooks/useUnifiedData';

export function useInstrumentSearch() {
  const [showInstrumentSearch, setShowInstrumentSearch] = useState(false);
  const [instrumentSearchTerm, setInstrumentSearchTerm] = useState('');

  const { instruments } = useUnifiedInstruments();

  // ✅ FIXED: useDeferredValue로 입력을 늦춰서 UI 끊김 완화
  const deferred = useDeferredValue(instrumentSearchTerm);

  // ✅ FIXED: 사전 계산된 검색 가능한 문자열로 성능 개선
  const instrumentsWithSearchableString = useMemo(() => {
    return instruments.map(instrument => ({
      instrument,
      searchable:
        `${instrument.maker ?? ''} ${instrument.type ?? ''} ${instrument.subtype ?? ''} ${instrument.serial_number ?? ''}`.toLowerCase(),
    }));
  }, [instruments]);

  // Client-side search using useMemo for performance
  const searchResults = useMemo<Instrument[]>(() => {
    if (deferred.length < 2) {
      return [];
    }

    const q = deferred.toLowerCase();
    return instrumentsWithSearchableString
      .filter(({ searchable }) => searchable.includes(q))
      .map(({ instrument }) => instrument);
  }, [instrumentsWithSearchableString, deferred]);

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
