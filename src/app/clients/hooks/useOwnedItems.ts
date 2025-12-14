import { useState, useRef, useCallback } from 'react';
import { Client, Instrument } from '@/types';
import { logError } from '@/utils/logger';
// Removed direct supabase import to reduce bundle size - using API routes instead

export function useOwnedItems() {
  const [ownedItems, setOwnedItems] = useState<Instrument[]>([]);
  const [loadingOwnedItems, setLoadingOwnedItems] = useState(false);

  // ✅ FIXED: AbortController로 레이스 컨디션 방지
  const abortRef = useRef<AbortController | null>(null);

  // ✅ FIXED: clientId별 간단 캐시 (재클릭 UX 개선)
  const cacheRef = useRef<Map<string, Instrument[]>>(new Map());

  const fetchOwnedItems = useCallback(async (client: Client) => {
    // 이전 요청 취소
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // 캐시 확인
    const cacheKey = client.id;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setOwnedItems(cached);
      return;
    }

    try {
      setLoadingOwnedItems(true);
      // Use API route instead of direct Supabase client to reduce bundle size
      const ownershipValue =
        `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim();
      const params = new URLSearchParams({
        ownership: ownershipValue,
        orderBy: 'created_at',
        ascending: 'false',
      });

      const response = await fetch(`/api/instruments?${params.toString()}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch owned items: ${response.statusText}`);
      }

      const result = await response.json();
      const items = result.data || [];

      // 캐시에 저장
      cacheRef.current.set(cacheKey, items);
      setOwnedItems(items);
    } catch (e: unknown) {
      // AbortError는 정상적인 취소이므로 무시
      if (e instanceof Error && e.name === 'AbortError') {
        return;
      }
      logError('Error fetching owned items', e, 'useOwnedItems', {
        clientId: client.id,
        clientName: `${client.first_name ?? ''} ${client.last_name ?? ''}`,
        operation: 'fetchOwnedItems',
      });
      setOwnedItems([]);
    } finally {
      setLoadingOwnedItems(false);
    }
  }, []);

  const clearOwnedItems = useCallback(() => {
    setOwnedItems([]);
    // 캐시는 유지 (재사용 가능)
  }, []);

  return {
    ownedItems,
    loadingOwnedItems,
    fetchOwnedItems,
    clearOwnedItems,
  };
}
