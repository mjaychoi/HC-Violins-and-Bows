import { useState, useRef, useCallback } from 'react';
import { Client, Instrument } from '@/types';
import { logError } from '@/utils/logger';
import { apiFetch } from '@/utils/apiFetch';
// Removed direct supabase import to reduce bundle size - using API routes instead

export function useOwnedItems() {
  const [ownedItems, setOwnedItems] = useState<Instrument[]>([]);
  const [loadingOwnedItems, setLoadingOwnedItems] = useState(false);
  const [status, setStatus] = useState<
    'loading' | 'success' | 'empty' | 'error'
  >('empty');

  // ✅ FIXED: AbortController로 레이스 컨디션 방지
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  // ✅ FIXED: clientId별 간단 캐시 (재클릭 UX 개선)
  const cacheRef = useRef<Map<string, Instrument[]>>(new Map());

  const fetchOwnedItems = useCallback(async (client: Client) => {
    const requestId = ++requestIdRef.current;
    // 이전 요청 취소
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // ✅ FIXED: Use ownershipValue as cache key (matches actual API query)
    // This ensures cache consistency when client name changes
    const ownershipValue =
      `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim();

    // 캐시 확인
    const cacheKey = ownershipValue;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setOwnedItems(cached);
      setStatus(cached.length > 0 ? 'success' : 'empty');
      setLoadingOwnedItems(false);
      return;
    }

    try {
      setOwnedItems([]);
      setStatus('loading');
      setLoadingOwnedItems(true);
      // Use API route instead of direct Supabase client to reduce bundle size
      const params = new URLSearchParams({
        ownership: ownershipValue,
        orderBy: 'created_at',
        ascending: 'false',
      });

      const response = await apiFetch(`/api/instruments?${params.toString()}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch owned items: ${response.statusText}`);
      }

      const result = await response.json();
      const items = result.data || [];

      if (requestId !== requestIdRef.current) {
        return;
      }

      // 캐시에 저장
      cacheRef.current.set(cacheKey, items);
      setOwnedItems(items);
      setStatus(items.length > 0 ? 'success' : 'empty');
    } catch (e: unknown) {
      // AbortError는 정상적인 취소이므로 무시
      if (e instanceof Error && e.name === 'AbortError') {
        return;
      }
      if (requestId !== requestIdRef.current) {
        return;
      }
      logError('Error fetching owned items', e, 'useOwnedItems', {
        clientId: client.id,
        clientName: `${client.first_name ?? ''} ${client.last_name ?? ''}`,
        operation: 'fetchOwnedItems',
      });
      setOwnedItems([]);
      setStatus('error');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingOwnedItems(false);
      }
    }
  }, []);

  const clearOwnedItems = useCallback(() => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    setOwnedItems([]);
    setStatus('empty');
    // 캐시는 유지 (재사용 가능)
  }, []);

  return {
    ownedItems,
    loadingOwnedItems,
    status,
    fetchOwnedItems,
    clearOwnedItems,
  };
}
