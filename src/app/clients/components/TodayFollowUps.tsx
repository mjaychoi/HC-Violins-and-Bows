'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { addDays, format, differenceInDays } from 'date-fns';
import { ContactLog } from '@/types';
import { todayLocalYMD } from '@/utils/dateParsing';
import { formatDisplayDate } from '@/utils/dateParsing';
import Link from 'next/link';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { apiFetch } from '@/utils/apiFetch';

export default function TodayFollowUps() {
  const [followUps, setFollowUps] = useState<ContactLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const { handleError, showSuccess } = useAppFeedback();

  const fetchTodayFollowUps = useCallback(async () => {
    setLoading(true);
    try {
      // FIXED: Use followUpDue=true to get both today and overdue follow-ups
      const response = await apiFetch(`/api/contacts?followUpDue=true`);

      if (!response.ok) {
        // Handle non-OK responses without throwing to prevent error boundary
        let errorMessage = 'Failed to fetch follow-ups';
        let errorDetails: unknown = null;
        try {
          const result = await response.json();
          // Handle different error response formats
          errorMessage = result.error || result.message || errorMessage;
          errorDetails = result;
        } catch {
          // If JSON parsing fails, use status text
          errorMessage = response.statusText || errorMessage;
        }

        // 개발 환경에서 더 자세한 에러 정보 로깅
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to fetch follow-ups:', {
            status: response.status,
            statusText: response.statusText,
            errorMessage,
            errorDetails,
          });
        } else {
          console.error('Failed to fetch follow-ups:', errorMessage);
        }

        setFollowUps([]);
        return;
      }

      const result = await response.json();
      setFollowUps(result.data || []);
    } catch (error) {
      // Silently handle errors - don't show toast for background data fetching
      // Empty state will be shown if no follow-ups are available
      console.error('Failed to fetch follow-ups:', error);
      setFollowUps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodayFollowUps();
  }, [fetchTodayFollowUps]);

  // FIXED: Close menu when clicking outside using ref-based detection
  useEffect(() => {
    if (!openMenuId) return;

    const menuEl = menuRefs.current.get(openMenuId);
    if (!menuEl) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuEl.contains(target)) {
        setOpenMenuId(null);
      }
    };

    // Use capture phase for early event handling
    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, [openMenuId]);

  const handleComplete = useCallback(
    async (contactLogId: string) => {
      setProcessingIds(prev => new Set(prev).add(contactLogId));
      try {
        const response = await apiFetch('/api/contacts', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: contactLogId,
            follow_up_completed_at: new Date().toISOString(),
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to complete follow-up');
        }

        // Refresh the list
        await fetchTodayFollowUps();
        showSuccess('Follow-up completed.');
      } catch (error) {
        handleError(error, 'Complete follow-up');
      } finally {
        setProcessingIds(prev => {
          const next = new Set(prev);
          next.delete(contactLogId);
          return next;
        });
      }
    },
    [fetchTodayFollowUps, handleError, showSuccess]
  );

  const handlePostpone = useCallback(
    async (contactLogId: string, days: number) => {
      setProcessingIds(prev => new Set(prev).add(contactLogId));
      try {
        // FIXED: Use todayLocalYMD() as single source of truth for date calculations
        const todayStr = todayLocalYMD();
        const base = new Date(`${todayStr}T00:00:00`);
        const newFollowUpDate = format(addDays(base, days), 'yyyy-MM-dd');

        const response = await apiFetch('/api/contacts', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: contactLogId,
            next_follow_up_date: newFollowUpDate,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to postpone follow-up');
        }

        // Refresh the list
        await fetchTodayFollowUps();
        showSuccess(`Follow-up postponed by ${days} days.`);
      } catch (error) {
        handleError(error, 'Postpone follow-up');
      } finally {
        setProcessingIds(prev => {
          const next = new Set(prev);
          next.delete(contactLogId);
          return next;
        });
      }
    },
    [fetchTodayFollowUps, handleError, showSuccess]
  );

  const handleEmail = useCallback(
    (client: ContactLog['client']) => {
      if (!client?.email) {
        handleError(new Error('No email address available.'), 'Send email');
        return;
      }

      const clientName =
        `${client.first_name || ''} ${client.last_name || ''}`.trim() ||
        client.email;
      const subject = encodeURIComponent(`Follow-up: ${clientName}`);
      const body = encodeURIComponent(
        `Hello ${clientName},\n\nFollowing up with you.\n\nThank you.`
      );

      window.location.href = `mailto:${client.email}?subject=${subject}&body=${body}`;
    },
    [handleError]
  );

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-6">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (followUps.length === 0) {
    return null;
  }

  // Group by client
  const followUpsByClient = followUps.reduce(
    (acc, log) => {
      const clientId = log.client_id;
      if (!acc[clientId]) {
        acc[clientId] = [];
      }
      acc[clientId].push(log);
      return acc;
    },
    {} as Record<string, ContactLog[]>
  );

  // FIXED: For each client, find the most urgent follow-up (earliest next_follow_up_date)
  // and use non-follow_up type log for "last contact" display if available
  Object.keys(followUpsByClient).forEach(clientId => {
    const logs = followUpsByClient[clientId];
    // Sort by next_follow_up_date (earliest first) for urgency
    logs.sort((a, b) => {
      if (!a.next_follow_up_date) return 1;
      if (!b.next_follow_up_date) return -1;
      return a.next_follow_up_date.localeCompare(b.next_follow_up_date);
    });
  });

  const today = todayLocalYMD();

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg shadow-sm p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-amber-600">⏰</span>
          <h3 className="text-sm font-semibold text-amber-900">
            People to contact today
          </h3>
          <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
            {Object.keys(followUpsByClient).length}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {Object.entries(followUpsByClient).map(([clientId, logs]) => {
          // FIXED: Use the most urgent follow-up (earliest next_follow_up_date)
          const primaryLog = logs[0];

          // FIXED: Find related contact log (non-follow_up type) within this follow-up due list
          // Note: This is not the "true last contact" but a related record in the current context
          const relatedContactLog =
            logs.find(l => l.contact_type !== 'follow_up') ?? logs[0];

          // FIXED: Use client from API response (source of truth)
          const client = primaryLog?.client;
          const clientName = client
            ? `${client.first_name || ''} ${client.last_name || ''}`.trim() ||
              client.email ||
              'Unknown Client'
            : 'Unknown Client';

          // Check if overdue and calculate days
          const isOverdue =
            primaryLog.next_follow_up_date &&
            primaryLog.next_follow_up_date < today;
          const daysOverdue =
            isOverdue && primaryLog.next_follow_up_date
              ? differenceInDays(
                  new Date(`${today}T00:00:00`),
                  new Date(`${primaryLog.next_follow_up_date}T00:00:00`)
                )
              : 0;
          const purpose = primaryLog.purpose
            ? primaryLog.purpose === 'follow_up'
              ? 'Follow-up'
              : primaryLog.purpose
            : '';

          return (
            <div
              key={clientId}
              className={`bg-white border rounded-md p-3 hover:border-amber-300 transition-colors ${
                isOverdue ? 'border-red-300 bg-red-50' : 'border-amber-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/clients?clientId=${clientId}`}
                      className="text-sm font-medium text-amber-900 hover:text-amber-700 hover:underline"
                    >
                      {clientName}
                    </Link>
                    {isOverdue ? (
                      <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                        {daysOverdue} {daysOverdue === 1 ? 'day' : 'days'}{' '}
                        overdue
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                        Today
                      </span>
                    )}
                  </div>
                  {purpose && (
                    <p className="text-xs text-amber-600 mt-1">{purpose}</p>
                  )}
                  {primaryLog.content && (
                    <p className="text-xs text-gray-600 mt-1 line-clamp-1">
                      {primaryLog.content}
                    </p>
                  )}
                  {relatedContactLog.contact_date && (
                    <p className="text-xs text-gray-500 mt-1">
                      Related record:{' '}
                      {formatDisplayDate(relatedContactLog.contact_date)}
                    </p>
                  )}
                  {primaryLog.next_follow_up_date && (
                    <p className="text-xs text-gray-500 mt-1">
                      Follow-up:{' '}
                      {formatDisplayDate(primaryLog.next_follow_up_date)}
                    </p>
                  )}
                </div>

                {/* 즉시 액션 버튼 */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* 메일 버튼 */}
                  {client?.email && (
                    <button
                      type="button"
                      onClick={() => handleEmail(client)}
                      className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                      title="Send email"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </button>
                  )}

                  {/* 완료 버튼 */}
                  <button
                    type="button"
                    onClick={() => handleComplete(primaryLog.id)}
                    disabled={processingIds.has(primaryLog.id)}
                    className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 hover:border-green-300 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Complete follow-up"
                  >
                    {processingIds.has(primaryLog.id)
                      ? 'Processing...'
                      : '✓ Complete'}
                  </button>

                  {/* 미루기 버튼 (드롭다운) */}
                  <div
                    className="relative"
                    ref={el => {
                      if (el) {
                        menuRefs.current.set(primaryLog.id, el);
                      } else {
                        menuRefs.current.delete(primaryLog.id);
                      }
                    }}
                  >
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setOpenMenuId(
                          openMenuId === primaryLog.id ? null : primaryLog.id
                        );
                      }}
                      disabled={processingIds.has(primaryLog.id)}
                      className="px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 hover:border-amber-300 rounded transition disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Postpone Follow-up"
                    >
                      ⏱️
                    </button>
                    {openMenuId === primaryLog.id && (
                      <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handlePostpone(primaryLog.id, 7);
                            setOpenMenuId(null);
                          }}
                          disabled={processingIds.has(primaryLog.id)}
                          className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 first:rounded-t-md disabled:opacity-50"
                        >
                          In 7 days
                        </button>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handlePostpone(primaryLog.id, 30);
                            setOpenMenuId(null);
                          }}
                          disabled={processingIds.has(primaryLog.id)}
                          className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          In 30 days
                        </button>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handlePostpone(primaryLog.id, 90);
                            setOpenMenuId(null);
                          }}
                          disabled={processingIds.has(primaryLog.id)}
                          className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 last:rounded-b-md disabled:opacity-50"
                        >
                          In 90 days
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
