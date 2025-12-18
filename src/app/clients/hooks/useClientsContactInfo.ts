import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ContactLog } from '@/types';
import { todayLocalYMD, formatDisplayDate } from '@/utils/dateParsing';
import { differenceInDays, parseISO } from 'date-fns';

export interface ClientContactInfo {
  clientId: string;
  lastContactDate: string | null; // YYYY-MM-DD
  lastContactDateDisplay: string | null; // Formatted for display
  nextFollowUpDate: string | null; // YYYY-MM-DD
  nextFollowUpDateDisplay: string | null; // Formatted for display
  isOverdue: boolean;
  daysSinceLastContact: number | null;
  daysUntilFollowUp: number | null;
}

interface UseClientsContactInfoOptions {
  clientIds: string[];
  enabled?: boolean;
}

export function useClientsContactInfo({
  clientIds,
  enabled = true,
}: UseClientsContactInfoOptions) {
  const [contactInfoMap, setContactInfoMap] = useState<
    Map<string, ClientContactInfo>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const [refetchIndex, setRefetchIndex] = useState(0);

  // Normalize clientIds to string for comparison (avoid array reference issues)
  const clientIdsKey = useMemo(
    () => [...clientIds].sort().join(','),
    [clientIds]
  );
  const prevClientIdsKeyRef = useRef<string>('');

  useEffect(() => {
    // Only fetch if clientIds actually changed (by comparing normalized string)
    if (clientIdsKey === prevClientIdsKeyRef.current) {
      return; // No change, skip fetch
    }
    prevClientIdsKeyRef.current = clientIdsKey;

    if (!enabled || clientIds.length === 0) {
      setContactInfoMap(new Map());
      return;
    }

    let cancelled = false;

    const fetchContactInfo = async () => {
      setLoading(true);
      try {
        // Fetch all contact logs for all clients using batch endpoint
        // Batch size limit: 100 clientIds per request to avoid URL length issues
        const batchSize = 100;
        const batches: string[][] = [];
        const sortedClientIds = [...clientIds].sort(); // Use sorted copy
        for (let i = 0; i < sortedClientIds.length; i += batchSize) {
          batches.push(sortedClientIds.slice(i, i + batchSize));
        }

        const allLogs: ContactLog[] = [];

        for (const batch of batches) {
          if (cancelled) return;

          try {
            // Use batch endpoint: /api/contacts?clientIds=id1,id2,id3
            const clientIdsParam = batch.join(',');
            const response = await fetch(
              `/api/contacts?clientIds=${encodeURIComponent(clientIdsParam)}`
            );
            const result = await response.json();
            if (!response.ok) {
              throw result.error || new Error('Failed to fetch contact logs');
            }
            if (result.data) {
              allLogs.push(...(result.data as ContactLog[]));
            }
          } catch (error) {
            console.error(`Failed to fetch contact logs for batch:`, error);
            throw error;
          }
        }

        if (cancelled) return;

        // Process logs to extract contact info per client
        const infoMap = new Map<string, ClientContactInfo>();
        const today = todayLocalYMD();

        for (const clientId of sortedClientIds) {
          const clientLogs = allLogs.filter(log => log.client_id === clientId);

          if (clientLogs.length === 0) {
            infoMap.set(clientId, {
              clientId,
              lastContactDate: null,
              lastContactDateDisplay: null,
              nextFollowUpDate: null,
              nextFollowUpDateDisplay: null,
              isOverdue: false,
              daysSinceLastContact: null,
              daysUntilFollowUp: null,
            });
            continue;
          }

          // Find last contact date (most recent contact_date)
          const lastContactLog = clientLogs.reduce((latest, log) => {
            if (!latest) return log;
            return log.contact_date > latest.contact_date ? log : latest;
          }, clientLogs[0]);

          // Find next follow-up date (earliest incomplete next_follow_up_date)
          const incompleteFollowUps = clientLogs.filter(
            log => log.next_follow_up_date && !log.follow_up_completed_at
          );

          const nextFollowUpLog = incompleteFollowUps.reduce(
            (earliest, log) => {
              if (!earliest) return log;
              if (!log.next_follow_up_date) return earliest;
              if (!earliest.next_follow_up_date) return log;
              return log.next_follow_up_date < earliest.next_follow_up_date
                ? log
                : earliest;
            },
            null as ContactLog | null
          );

          const lastContactDate = lastContactLog?.contact_date || null;
          const nextFollowUpDate = nextFollowUpLog?.next_follow_up_date || null;

          // Calculate days
          let daysSinceLastContact: number | null = null;
          if (lastContactDate) {
            try {
              const lastDate = parseISO(`${lastContactDate}T00:00:00`);
              const todayDate = parseISO(`${today}T00:00:00`);
              daysSinceLastContact = differenceInDays(todayDate, lastDate);
            } catch {
              // Ignore parse errors
            }
          }

          let daysUntilFollowUp: number | null = null;
          if (nextFollowUpDate) {
            try {
              const followUpDate = parseISO(`${nextFollowUpDate}T00:00:00`);
              const todayDate = parseISO(`${today}T00:00:00`);
              daysUntilFollowUp = differenceInDays(followUpDate, todayDate);
            } catch {
              // Ignore parse errors
            }
          }

          const isOverdue =
            nextFollowUpDate !== null &&
            nextFollowUpDate < today &&
            !nextFollowUpLog?.follow_up_completed_at;

          infoMap.set(clientId, {
            clientId,
            lastContactDate,
            lastContactDateDisplay: lastContactDate
              ? formatDisplayDate(lastContactDate)
              : null,
            nextFollowUpDate,
            nextFollowUpDateDisplay: nextFollowUpDate
              ? formatDisplayDate(nextFollowUpDate)
              : null,
            isOverdue,
            daysSinceLastContact,
            daysUntilFollowUp,
          });
        }

        if (!cancelled) {
          setContactInfoMap(infoMap);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to fetch contact info:', error);
          // Set empty map on error
          setContactInfoMap(new Map());
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchContactInfo();

    return () => {
      cancelled = true;
    };
    // We intentionally omit `clientIds` from the dependency list above because
    // `clientIdsKey` already tracks the sorted values. This prevents effect
    // re-running when a new array reference is created during loading state updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientIdsKey, enabled, refetchIndex]);

  const getContactInfo = useCallback(
    (clientId: string): ClientContactInfo | null => {
      return contactInfoMap.get(clientId) || null;
    },
    [contactInfoMap]
  );

  const refetch = useCallback(() => {
    // Reset the ref to force a refetch
    prevClientIdsKeyRef.current = '';
    setRefetchIndex(value => value + 1);
  }, []);

  return {
    contactInfoMap,
    getContactInfo,
    loading,
    refetch,
  };
}
