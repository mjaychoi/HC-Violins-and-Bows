import { useState } from 'react';
import { Instrument } from '@/types';
import { useOptimizedInstruments as useInstruments } from '@/hooks/useOptimizedInstruments';
import { logError } from '@/utils/logger';

export function useInstrumentSearch() {
  const [showInstrumentSearch, setShowInstrumentSearch] = useState(false);
  const [instrumentSearchTerm, setInstrumentSearchTerm] = useState('');

  const { searchResults, searchInstruments: searchInstrumentsHook } =
    useInstruments();

  const [isSearchingInstruments, setIsSearchingInstruments] = useState(false);

  const searchInstruments = searchInstrumentsHook;

  const openInstrumentSearch = () => setShowInstrumentSearch(true);
  const closeInstrumentSearch = () => {
    setShowInstrumentSearch(false);
    setInstrumentSearchTerm('');
  };

  const handleInstrumentSearch = async (term: string) => {
    setInstrumentSearchTerm(term);
    if (term.length >= 2) {
      setIsSearchingInstruments(true);
      try {
        await searchInstruments(term);
      } catch (error) {
        logError('Error searching instruments', error, 'useInstrumentSearch');
      } finally {
        setIsSearchingInstruments(false);
      }
    }
  };

  return {
    showInstrumentSearch,
    instrumentSearchTerm,
    searchResults: searchResults as Instrument[],
    isSearchingInstruments,
    openInstrumentSearch,
    closeInstrumentSearch,
    handleInstrumentSearch,
  };
}
