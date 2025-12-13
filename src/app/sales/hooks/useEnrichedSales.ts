import { useMemo } from 'react';
import { EnrichedSale, Client, Instrument } from '@/types';
import { SalesHistory } from '@/types';
import { createMaps, enrichSales, sortByClientName } from '../utils/salesUtils';
import { SortColumn, SortDirection } from '../types';

// FIXED: Removed search parameter - server handles filtering, client only enriches + sorts
export function useEnrichedSales(
  sales: SalesHistory[],
  clients: Client[],
  instruments: Instrument[],
  sortColumn: SortColumn,
  sortDirection: SortDirection
) {
  const { clientMap, instrumentMap } = useMemo(
    () => createMaps(clients, instruments),
    [clients, instruments]
  );

  const enrichedSales = useMemo<EnrichedSale[]>(() => {
    // 1. 데이터 보강
    let enriched = enrichSales(sales, clientMap, instrumentMap);

    // FIXED: Remove client-side search filtering - server already handles from/to/search filtering
    // Double filtering was causing confusion: server returns 10 items (page size),
    // client re-filters them, could become < 10, making pagination text misleading
    // Now: server handles from/to/search filtering, client only does enrichment + client_name sort

    // 2. client_name 정렬만 클라이언트에서 처리 (서버에서는 처리 불가)
    if (sortColumn === 'client_name') {
      enriched = sortByClientName(enriched, sortDirection);
    }
    // Note: sale_date와 sale_price는 서버에서 정렬됨

    return enriched;
  }, [sales, clientMap, instrumentMap, sortColumn, sortDirection]);

  return enrichedSales;
}
