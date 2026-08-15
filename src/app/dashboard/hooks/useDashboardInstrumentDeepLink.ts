'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Instrument } from '@/types';
import { validateUUID } from '@/utils/inputValidation';
import { apiFetch } from '@/utils/apiFetch';
import { readApiResponseEnvelope } from '@/utils/handleApiResponse';
import { useTenantIdentity } from '@/hooks/useTenantIdentity';

export type DashboardInstrumentDeepLinkStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'not_found'
  | 'invalid'
  | 'error';

type RemoteResolution = {
  key: string;
  status: Exclude<DashboardInstrumentDeepLinkStatus, 'idle' | 'invalid'>;
  target: Instrument | null;
};

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function readInstrumentRow(data: unknown): Instrument | null {
  if (Array.isArray(data)) {
    const row = data[0];
    if (row && typeof row === 'object' && typeof row.id === 'string') {
      return row as Instrument;
    }
    return null;
  }

  if (
    data &&
    typeof data === 'object' &&
    typeof (data as Instrument).id === 'string'
  ) {
    return data as Instrument;
  }

  return null;
}

export function useDashboardInstrumentDeepLink({
  instruments,
  truncated,
  instrumentsLoading,
  hasFatalError,
}: {
  instruments: Instrument[];
  truncated: boolean;
  instrumentsLoading: boolean;
  hasFatalError: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { tenantIdentityKey, isTenantTransitioning } = useTenantIdentity();

  const instrumentId = searchParams.get('instrumentId');
  const isValidId = Boolean(instrumentId && validateUUID(instrumentId));

  const [retryNonce, setRetryNonce] = useState(0);
  const [resolution, setResolution] = useState<RemoteResolution | null>(null);

  const localTarget = useMemo(() => {
    if (!instrumentId || !isValidId || isTenantTransitioning) {
      return null;
    }
    return instruments.find(item => item.id === instrumentId) ?? null;
  }, [instrumentId, isValidId, isTenantTransitioning, instruments]);

  const resolutionKey = `${tenantIdentityKey ?? 'none'}:${instrumentId ?? ''}:${retryNonce}`;

  const clearDeepLink = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has('instrumentId')) {
      return;
    }
    params.delete('instrumentId');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const retry = useCallback(() => {
    setRetryNonce(value => value + 1);
  }, []);

  useEffect(() => {
    if (!instrumentId || !isValidId || localTarget || hasFatalError) {
      return;
    }

    if (isTenantTransitioning || instrumentsLoading) {
      return;
    }

    const collectionIsComplete = !truncated && instruments.length > 0;
    if (collectionIsComplete) {
      setResolution({
        key: resolutionKey,
        status: 'not_found',
        target: null,
      });
      return;
    }

    const controller = new AbortController();
    setResolution({
      key: resolutionKey,
      status: 'loading',
      target: null,
    });

    void (async () => {
      try {
        const response = await apiFetch(
          `/api/instruments?id=${encodeURIComponent(instrumentId)}`,
          { signal: controller.signal }
        );

        if (controller.signal.aborted) {
          return;
        }

        if (response.status === 404) {
          setResolution({
            key: resolutionKey,
            status: 'not_found',
            target: null,
          });
          return;
        }

        if (!response.ok) {
          setResolution({
            key: resolutionKey,
            status: 'error',
            target: null,
          });
          return;
        }

        const body = await readApiResponseEnvelope<Instrument | Instrument[]>(
          response,
          'Failed to load item'
        );
        const row = readInstrumentRow(body.data);

        if (controller.signal.aborted) {
          return;
        }

        if (!row) {
          setResolution({
            key: resolutionKey,
            status: 'not_found',
            target: null,
          });
          return;
        }

        setResolution({
          key: resolutionKey,
          status: 'ready',
          target: row,
        });
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }
        setResolution({
          key: resolutionKey,
          status: 'error',
          target: null,
        });
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    hasFatalError,
    instrumentId,
    instruments.length,
    instrumentsLoading,
    isTenantTransitioning,
    isValidId,
    localTarget,
    resolutionKey,
    truncated,
  ]);

  if (!instrumentId) {
    return {
      status: 'idle' as const,
      instrumentId: null,
      target: null,
      clearDeepLink,
      retry,
    };
  }

  if (!isValidId) {
    return {
      status: 'invalid' as const,
      instrumentId,
      target: null,
      clearDeepLink,
      retry,
    };
  }

  if (localTarget) {
    return {
      status: 'ready' as const,
      instrumentId,
      target: localTarget,
      clearDeepLink,
      retry,
    };
  }

  if (resolution?.key === resolutionKey) {
    return {
      status: resolution.status,
      instrumentId,
      target: resolution.target,
      clearDeepLink,
      retry,
    };
  }

  return {
    status: 'loading' as const,
    instrumentId,
    target: null,
    clearDeepLink,
    retry,
  };
}
